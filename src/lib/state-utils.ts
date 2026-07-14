import { useReducer } from "react"

/**
 * Type-safe reducer factory — eliminates switch-case boilerplate.
 *
 * Instead of writing interfaces + union types + switch-case separately,
 * define the action union and provide handlers as an object map.
 *
 * Usage:
 *   type Action = { type: "inc" } | { type: "set"; value: number }
 *   const reducer = createReducer<State, Action>({
 *     inc:  (state) => ({ ...state, count: state.count + 1 }),
 *     set:  (state, a) => ({ ...state, count: a.value }),
 *   })
 *   const [state, dispatch] = useReducer(reducer, initialState)
 */
export function createReducer<S, A extends { type: string }>(
  handlers: {
    [K in A["type"]]?: (state: S, action: Extract<A, { type: K }>) => S
  },
): (state: S, action: A) => S {
  return (state: S, action: A) => {
    const key = action.type as A["type"]
    const handler = handlers[key] as ((s: S, a: A) => S) | undefined
    return handler ? handler(state, action) : state
  }
}

/** Standard async state shape (data / loading / error) */
export interface AsyncState<T> {
  data: T
  loading: boolean
  error: string | null
}

/** Standard async action types */
export type AsyncAction<T> =
  | { type: "loadStart" }
  | { type: "loadSuccess"; data: T }
  | { type: "loadError"; error: string }
  | { type: "clear"; initialData: T }

/** Pre-built reducer for the standard async pattern */
export function asyncReducer<T>(
  state: AsyncState<T>,
  action: AsyncAction<T>,
): AsyncState<T> {
  switch (action.type) {
    case "loadStart":
      return { ...state, loading: true, error: null }
    case "loadSuccess":
      return { data: action.data, loading: false, error: null }
    case "loadError":
      return { ...state, loading: false, error: action.error }
    case "clear":
      return { data: action.initialData, loading: false, error: null }
  }
}

/**
 * Convenience hook: combines useReducer with the standard async pattern.
 *
 *   const [state, dispatch] = useAsyncState<MyItem[]>([])
 *   dispatch({ type: "loadStart" })
 *   dispatch({ type: "loadSuccess", data: result })
 *   dispatch({ type: "loadError", error: "xxx" })
 *   dispatch({ type: "clear", initialData: [] })
 */
export function useAsyncState<T>(initialData: T) {
  return useReducer(
    (state: AsyncState<T>, action: AsyncAction<T>) => asyncReducer(state, action),
    { data: initialData, loading: false, error: null },
  )
}
