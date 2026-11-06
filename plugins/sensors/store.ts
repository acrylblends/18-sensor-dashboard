/**
 * Where the library is kept: a small port, so the domain never touches the disk itself. The app uses {@link jsonFileStore} under its data home;
 * tests pass {@link memoryStore}.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface Store<S> {
  /** The saved state, or undefined when nothing was saved yet (the app then seeds). */
  load(): Promise<S | undefined>
  save(state: S): Promise<void>
}

/** A store in memory; `saved` counts the saves, so a test can see that a change was persisted. */
export function memoryStore<S>(initial?: S): Store<S> & { readonly state: S | undefined; readonly saved: number } {
  let state: S | undefined = initial === undefined ? undefined : structuredClone(initial)
  let saved = 0
  return {
    get state() {
      return state
    },
    get saved() {
      return saved
    },
    load: async () => (state === undefined ? undefined : structuredClone(state)),
    async save(next) {
      state = structuredClone(next)
      saved += 1
    },
  }
}

/**
 * A store in one JSON file. A save writes a temporary file beside it and renames it over the old one, so a crash mid-write leaves the last good
 * state. A file that is not this app's state (another version, broken JSON) is refused with its path, never silently replaced by the seed.
 */
export function jsonFileStore<S extends { version: number }>(file: string, label: string): Store<S> {
  return {
    async load() {
      let text: string
      try {
        text = await readFile(file, 'utf8')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
        throw error
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch (cause) {
        throw new Error(`${file} is not valid JSON; fix or move it and start again`, { cause })
      }
      if (typeof parsed !== 'object' || parsed === null || (parsed as { version?: unknown }).version !== 1)
        throw new Error(`${file} is not a ${label} state of version 1; move it away to start from the seed`)
      return parsed as S
    },
    async save(state) {
      await mkdir(dirname(file), { recursive: true })
      const temporary = `${file}.${process.pid}.tmp`
      await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`)
      await rename(temporary, file)
    },
  }
}
