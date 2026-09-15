import type { Client } from "@libsql/client";
export type StoredCartLine={productId:string;quantity:number;deliveryType:"digital"|"physical"};
export class CartConflict extends Error {httpStatus=409;constructor(){super("Your cart changed in another tab. Reload before saving.");}}
export async function readCart(db:Client,userId:string){
  const tx=await db.transaction('read');
  try{
    const version=(await tx.execute({sql:"select version from cart_versions where user_id=?",args:[userId]})).rows[0];
    const rows=(await tx.execute({sql:"select product_id,quantity,delivery_type from cart_items where user_id=? order by product_id,delivery_type",args:[userId]})).rows;
    await tx.commit();return {version:Number(version?.version||0),items:rows.map(r=>({productId:String(r.product_id),quantity:Number(r.quantity),deliveryType:r.delivery_type as StoredCartLine['deliveryType']}))};
  }catch(e){await tx.rollback();throw e;}finally{tx.close();}
}
export async function writeCart(db:Client,userId:string,items:StoredCartLine[],expected:number){
  const tx=await db.transaction('write');
  try{
    await tx.execute({sql:"insert into cart_versions(user_id,version) values(?,0) on conflict(user_id) do nothing",args:[userId]});
    const result=await tx.execute({sql:"update cart_versions set version=version+1 where user_id=? and version=? returning version",args:[userId,expected]});
    if(!result.rows.length)throw new CartConflict();
    const unique=new Map<string,StoredCartLine>();
    for(const item of items){const key=item.productId+':'+item.deliveryType;if(unique.has(key))throw new Error("Duplicate cart line.");unique.set(key,item);}
    await tx.execute({sql:"delete from cart_items where user_id=?",args:[userId]});
    for(const item of items)await tx.execute({sql:"insert into cart_items(id,user_id,product_id,quantity,delivery_type,updated_at) values(?,?,?,?,?,?)",args:[crypto.randomUUID(),userId,item.productId,item.quantity,item.deliveryType,new Date().toISOString()]});
    await tx.commit();return Number(result.rows[0].version);
  }catch(e){await tx.rollback();throw e;}finally{tx.close();}
}
