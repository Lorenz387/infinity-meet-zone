import { cn } from "@/lib/cn";

export function Mark({ className }: { className?: string }) {
  return (
    <span className={cn("relative grid place-items-center rounded-full border border-copper", className)} aria-hidden>
      <span className="size-[30%] rounded-full bg-copper" />
    </span>
  );
}
