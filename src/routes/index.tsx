import { createFileRoute } from "@tanstack/react-router";
import { ArcHome } from "@/components/os/home";

export const Route = createFileRoute("/")({ component: ArcHome });

