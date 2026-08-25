import { useEffect } from 'react';

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} | Chorusify` : 'Chorusify - guess your favourite music';
  }, [title]);
}
