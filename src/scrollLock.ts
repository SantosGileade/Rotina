import { useEffect } from "react";

let locks = 0;
let savedY = 0;

// Trava a pagina de fundo (inclusive no iOS) enquanto houver algum modal aberto.
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const body = document.body;
    if (locks === 0) {
      savedY = window.scrollY;
      body.style.position = "fixed";
      body.style.top = `-${savedY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
    }
    locks += 1;
    return () => {
      locks -= 1;
      if (locks === 0) {
        body.style.position = "";
        body.style.top = "";
        body.style.left = "";
        body.style.right = "";
        body.style.width = "";
        window.scrollTo(0, savedY);
      }
    };
  }, [active]);
}
