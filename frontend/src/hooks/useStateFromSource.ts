import { type Dispatch, type SetStateAction, useState } from "react";

/**
 * State that starts from, and is reset to, a value derived from some other data — typically a server
 * response that arrives after the first render ("fill this editable copy once the record loads").
 *
 * The usual way to write that is an effect that calls `setState` when the data changes, which costs
 * an extra render with stale values on screen. React's recommended alternative is to adjust the state
 * *during render* when the source changes, which is what this does: the first render after `source`
 * changes already shows the new value. Between changes it behaves exactly like `useState`.
 */
export function useStateFromSource<Source, Value>(
  source: Source,
  derive: (source: Source) => Value,
): [Value, Dispatch<SetStateAction<Value>>] {
  const [previousSource, setPreviousSource] = useState(source);
  const [value, setValue] = useState<Value>(() => derive(source));

  if (!Object.is(source, previousSource)) {
    setPreviousSource(source);
    setValue(derive(source));
  }
  return [value, setValue];
}
