import { useCallback, useState } from 'react'

import {
  deleteCustomIndicator,
  listCustomIndicators,
  upsertCustomIndicator,
  type CustomIndicator,
} from '../lib/customIndicators'

/** `lib/customIndicators.ts`（localStorage CRUD）包一層 React state，供元件用。 */
export function useCustomIndicators() {
  const [list, setList] = useState<CustomIndicator[]>(() => listCustomIndicators())

  const save = useCallback((def: CustomIndicator): boolean => {
    const ok = upsertCustomIndicator(def)
    if (ok) setList(listCustomIndicators())
    return ok
  }, [])

  const remove = useCallback((id: string) => {
    deleteCustomIndicator(id)
    setList(listCustomIndicators())
  }, [])

  return { list, save, remove }
}
