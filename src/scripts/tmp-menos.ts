import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const f=(n:number)=>'$'+n.toLocaleString('es-MX',{minimumFractionDigits:2});
async function main(){
  const cs = await prisma.contract.findMany({
    where:{status:{in:['ACTIVE','IN_MORA']}, installmentAmount:{gt:0}},
    select:{codigoLegado:true,installmentAmount:true,financingAmount:true,
      project:{select:{code:true}}, client:{select:{firstName:true,lastName:true}},
      payments:{where:{status:'CONFIRMED',paymentType:'INSTALLMENT'},select:{amount:true}}}});
  const menos:any[]=[], mas:any[]=[];
  for(const c of cs){
    if(c.payments.length<4) continue;
    const m=new Map<number,number>();
    for(const p of c.payments) m.set(Math.round(p.amount),(m.get(Math.round(p.amount))??0)+1);
    const [monto,veces]=[...m.entries()].sort((a,b)=>b[1]-a[1])[0];
    if(veces<4) continue;
    const reg=c.installmentAmount??0;
    const dif=monto-reg;
    if(Math.abs(dif)<=1) continue;
    const fila={code:c.project.code,cod:c.codigoLegado,cli:`${c.client.firstName} ${c.client.lastName}`,reg,monto,veces,dif,
      plazo:c.financingAmount?Math.round(c.financingAmount/monto):null};
    (dif<0?menos:mas).push(fila);
  }
  menos.sort((a,b)=>a.dif-b.dif);
  console.log(`   PAGAN MENOS: ${menos.length} contratos  (el recibo les cobra de mas y salen como morosos)`);
  menos.forEach(x=>console.log(`     ${x.code.padEnd(5)} ${String(x.cod).padEnd(7)} ${x.cli.slice(0,26).padEnd(27)} registrada ${f(x.reg).padStart(12)} · paga ${f(x.monto).padStart(12)} · dif ${f(x.dif).padStart(12)} · ${x.veces} veces · plazo real ${x.plazo}`));
  console.log(`\n   PAGAN MAS: ${mas.length} contratos  (adelantan o redondean; no es error del plan)`);
  const redondeo=mas.filter(x=>x.dif<=50).length;
  console.log(`     de esos, ${redondeo} pagan menos de $50 de mas (puro redondeo)`);
}
main().catch(e=>{console.error('❌',e.message);process.exit(1)}).finally(()=>prisma.$disconnect());
