import { dlopen, FFIType, ptr } from 'bun:ffi'
import type { Subprocess } from 'bun'

/**
 * A pseudo-terminal implementation for the Bun runtime.
 *
 * node-pty does not work under Bun (ESPIPE when reading the PTY master fd), so
 * we allocate a real PTY via libc/libutil `openpty(3)`, spawn the shell with its
 * stdio bound to the slave fd, and read/write the master fd directly through
 * non-blocking FFI syscalls. Window resizing uses `ioctl(TIOCSWINSZ)`.
 */

function loadLinuxLibs() {
  const libutil = dlopen('libutil.so.1', {
    openpty: {
      args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr],
      returns: FFIType.int,
    },
  })
  const libc = dlopen('libc.so.6', {
    read: { args: [FFIType.int, FFIType.ptr, FFIType.u64], returns: FFIType.i64 },
    write: { args: [FFIType.int, FFIType.ptr, FFIType.u64], returns: FFIType.i64 },
    close: { args: [FFIType.int], returns: FFIType.int },
    fcntl: { args: [FFIType.int, FFIType.int, FFIType.int], returns: FFIType.int },
    ioctl: { args: [FFIType.int, FFIType.u64, FFIType.ptr], returns: FFIType.int },
  })
  return { libutil, libc }
}

// Loaded lazily so importing this module on macOS never touches Linux-only libs.
let linuxLibs: ReturnType<typeof loadLinuxLibs> | null = null
function linux() {
  return (linuxLibs ??= loadLinuxLibs())
}

// Linux constants
const F_SETFL = 4
const O_NONBLOCK = 2048
const TIOCSWINSZ = 0x5414

export interface PtyOptions {
  cwd?: string
  cols?: number
  rows?: number
  shell?: string
  env?: Record<string, string>
}

class LinuxPty {
  private master: number
  private slave: number
  private proc: Subprocess
  private readInterval: ReturnType<typeof setInterval> | null = null
  private readBuf = new Uint8Array(65536)
  private decoder = new TextDecoder()
  private onDataCb: ((data: string) => void) | null = null
  private onExitCb: (() => void) | null = null
  private closed = false
  private libc = linux().libc

  constructor(opts: PtyOptions = {}) {
    const { libutil } = linux()
    const masterArr = new Int32Array(1)
    const slaveArr = new Int32Array(1)
    const rc = libutil.symbols.openpty(ptr(masterArr), ptr(slaveArr), null, null, null)
    if (rc !== 0) throw new Error('openpty failed')
    this.master = masterArr[0]
    this.slave = slaveArr[0]

    const shell = opts.shell || process.env.SHELL || '/bin/bash'

    // `setsid -c` starts the shell in a new session and makes the slave PTY its
    // controlling terminal, which enables job control (Ctrl+C, fg/bg, etc.).
    this.proc = Bun.spawn(['setsid', '-c', shell, '-il'], {
      cwd: opts.cwd || process.env.HOME,
      stdio: [this.slave, this.slave, this.slave],
      env: {
        ...process.env,
        ...opts.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
      onExit: () => this.handleExit(),
    })

    // Set the initial window size.
    this.resize(opts.cols || 80, opts.rows || 24)

    // Make the master non-blocking so our poll loop never stalls.
    this.libc.symbols.fcntl(this.master, F_SETFL, O_NONBLOCK)

    this.startReadLoop()
  }

  private startReadLoop() {
    this.readInterval = setInterval(() => {
      if (this.closed) return
      // Drain everything currently available.
      for (let guard = 0; guard < 64; guard++) {
        const n = Number(this.libc.symbols.read(this.master, ptr(this.readBuf), BigInt(this.readBuf.length)))
        if (n > 0) {
          const chunk = this.decoder.decode(this.readBuf.subarray(0, n), { stream: true })
          this.onDataCb?.(chunk)
          if (n < this.readBuf.length) break
        } else {
          break
        }
      }
    }, 8)
  }

  onData(cb: (data: string) => void) {
    this.onDataCb = cb
  }

  onExit(cb: () => void) {
    this.onExitCb = cb
  }

  write(data: string) {
    if (this.closed) return
    const bytes = new TextEncoder().encode(data)
    this.libc.symbols.write(this.master, ptr(bytes), BigInt(bytes.length))
  }

  resize(cols: number, rows: number) {
    if (this.closed) return
    // struct winsize { unsigned short ws_row, ws_col, ws_xpixel, ws_ypixel; }
    const ws = new Uint16Array([rows, cols, 0, 0])
    this.libc.symbols.ioctl(this.master, BigInt(TIOCSWINSZ), ptr(ws))
  }

  private handleExit() {
    if (this.closed) return
    this.onExitCb?.()
    this.dispose()
  }

  dispose() {
    if (this.closed) return
    this.closed = true
    if (this.readInterval) clearInterval(this.readInterval)
    try {
      this.proc.kill()
    } catch {}
    try {
      this.libc.symbols.close(this.master)
      this.libc.symbols.close(this.slave)
    } catch {}
  }
}

/**
 * macOS: no `setsid` binary and different libc symbols/ioctl constants, so use
 * Bun's native PTY support (`Bun.spawn({ terminal })`). It allocates the PTY,
 * makes it the shell's controlling terminal (job control, Ctrl+C) and handles
 * resize — the same behavior the Linux FFI path implements by hand.
 */
class DarwinPty {
  private proc: Subprocess
  private terminal: any
  private onDataCb: ((data: string) => void) | null = null
  private onExitCb: (() => void) | null = null
  private decoder = new TextDecoder()
  private closed = false

  constructor(opts: PtyOptions = {}) {
    const shell = opts.shell || process.env.SHELL || '/bin/zsh'
    this.proc = Bun.spawn([shell, '-il'], {
      cwd: opts.cwd || process.env.HOME,
      env: {
        ...process.env,
        ...opts.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
      terminal: {
        cols: opts.cols || 80,
        rows: opts.rows || 24,
        data: (_t: unknown, chunk: Uint8Array | string) => {
          if (this.closed) return
          const text =
            typeof chunk === 'string' ? chunk : this.decoder.decode(chunk, { stream: true })
          this.onDataCb?.(text)
        },
      },
      onExit: () => this.handleExit(),
    } as any)
    this.terminal = (this.proc as any).terminal
    if (!this.terminal) throw new Error('This Bun version has no PTY support (need Bun >= 1.3.5)')
  }

  onData(cb: (data: string) => void) {
    this.onDataCb = cb
  }

  onExit(cb: () => void) {
    this.onExitCb = cb
  }

  write(data: string) {
    if (this.closed) return
    this.terminal.write(data)
  }

  resize(cols: number, rows: number) {
    if (this.closed) return
    this.terminal.resize(cols, rows)
  }

  private handleExit() {
    if (this.closed) return
    this.onExitCb?.()
    this.dispose()
  }

  dispose() {
    if (this.closed) return
    this.closed = true
    try {
      this.proc.kill()
    } catch {}
    try {
      this.terminal.close()
    } catch {}
  }
}

export type Pty = LinuxPty | DarwinPty
export const Pty: new (opts?: PtyOptions) => Pty =
  process.platform === 'darwin' ? DarwinPty : LinuxPty
