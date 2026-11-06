import { useEffect } from "react";
import { applyLook, loadLook } from "@/lib/os/look";

export function OsBoot() {
  useEffect(() => {
    applyLook(loadLook());
    localStorage.removeItem("arc-campaign");
    localStorage.removeItem("arc-abstract");
  }, []);
  return null;
}
