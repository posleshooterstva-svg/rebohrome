"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ProductRecord, SupportedCurrency } from "@/lib/rebohrome-data";
type Props={userId:string;orderId:string;amount:number;currency:SupportedCurrency;summary:string;createdAt:string;items:Array<{product:ProductRecord;quantity:number}>};
export function SuccessStateSync({orderId}:Props){const router=useRouter();useEffect(()=>{router.refresh();},[orderId,router]);return null;}
