import { loadSnapshot, type Snapshot } from '../lib/data'
import { useAsync, type AsyncState } from './useAsync'

export function useSnapshot(): AsyncState<Snapshot> {
  return useAsync(loadSnapshot, [])
}
