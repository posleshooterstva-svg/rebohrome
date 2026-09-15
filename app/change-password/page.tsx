import { redirect } from "next/navigation";
import { getSessionState } from "@/lib/session";
import { ChangePassword } from "@/components/auth/change-password";
export const dynamic="force-dynamic";
export default async function Page(){const session=await getSessionState({allowPasswordReset:true});if(!session.userId)redirect('/login');return <ChangePassword/>;}
