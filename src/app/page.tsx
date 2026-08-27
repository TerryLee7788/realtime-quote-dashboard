import { redirect } from "next/navigation";

export default function Home() {
  // 已登入 → 進 dashboard；未登入時 middleware 會先攔截導向 /login
  redirect("/dashboard");
}
