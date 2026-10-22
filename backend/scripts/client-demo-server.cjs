require('./demo-guard.cjs')();
const express=require('express'), path=require('path');
const outer=express();
outer.disable('x-powered-by');
outer.set('trust proxy',1);
outer.use((req,res,next)=>{
 res.set('X-Robots-Tag','noindex, nofollow');
 if(req.path.startsWith('/api/')) res.set('Cache-Control','no-store');
 next();
});
const attempts=new Map();
outer.use('/api/auth/login',(req,res,next)=>{
 const key=req.ip, now=Date.now(), old=attempts.get(key);
 const item=old && now-old.at<60000 ? old : {at:now,n:0};
 item.n++; attempts.set(key,item);
 if(attempts.size>10000) for(const [k,v] of attempts) if(now-v.at>60000) attempts.delete(k);
 if(item.n>15) return res.status(429).json({status:'error',message:'Please wait one minute before trying again.'});
 next();
});
outer.use('/api',(req,res,next)=>{
 const allowed=/^\/(auth\/(login|me|logout)(?:\/|$)|employees(?:\/|$)|analytics(?:\/|$)|attendance(?:\/|$)|leave(?:\/|$)|payroll(?:\/|$)|locations(?:\/|$)|location-catalog(?:\/|$)|organization(?:\/|$)|reports(?:\/|$)|recruitment(?:\/|$)|line-managers(?:\/|$))/;
 const forbidden=/(integration|paystack|webhook|send|email|invite|notification|automation|payment|bank-verif)/i;
 if(!allowed.test(req.path)||forbidden.test(req.path)) return res.status(403).json({status:'error',message:'This action is unavailable in the client demo.'});
 next();
});
const app=require('../src/app');
outer.use((req,res,next)=> req.path.startsWith('/api/') ? app(req,res,next) : next());
outer.get('/health',async(req,res)=>{try {await require('../src/config/prisma').$queryRawUnsafe('SELECT 1');res.json({status:'ok',mode:'synthetic-client-demo'});}catch {res.status(503).json({status:'unavailable'});}});
const dist=path.join(__dirname,'../../dist');
outer.use(express.static(dist));
outer.get('/{*path}',(req,res)=>res.sendFile(path.join(dist,'index.html')));
const server=outer.listen(process.env.PORT||5000,'0.0.0.0',()=>console.log('Isolated CHRiS client demo ready'));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
