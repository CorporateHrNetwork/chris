const {synchronize}=require('./zermattProbationService');
function createZermattProbationScheduler({prisma,intervalMs=60*60*1000}) {
  let timer=null,running=false;
  async function runOnce(now=new Date()) {
    if (running) return {skipped:'ALREADY_RUNNING'};
    running=true;
    try {return await synchronize(prisma,now);}
    catch(e){console.error('Zermatt probation scheduler failed:',e.message);return {error:e.message};}
    finally {running=false;}
  }
  function start(){if(timer)return;runOnce();timer=setInterval(()=>runOnce(),intervalMs);timer.unref?.();}
  function stop(){if(timer)clearInterval(timer);timer=null;}
  return {start,stop,runOnce};
}
module.exports={createZermattProbationScheduler};
