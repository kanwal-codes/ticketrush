import { useEffect } from 'react'

/** Sets the browser tab title while a page is showing. */
export function useTitle(title: string): void {
  useEffect(() => {
    const previous = document.title
    document.title = title
    return () => {
      document.title = previous
    }
  }, [title])
}
