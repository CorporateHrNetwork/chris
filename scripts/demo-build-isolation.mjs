import fs from 'node:fs';import path from 'node:path';import {transformSync} from '@babel/core';
const excluded=new Set(['EmployeeExits.jsx','Benefits.jsx','GratuityAccounts.jsx','ZermattLeaveAllowance.jsx','ZermattLeaveAllowanceSettings.jsx','ZermattEmploymentResources.jsx','ZermattAnnualCarryoverPanel.jsx','TransportSupportPayroll.jsx','TransportSupportPreparation.jsx','SalaryAdvancesManaged.jsx','RentReliefManaged.jsx','LoanBulkUpload.jsx','LoanProfile.jsx','Loans.jsx','PerformanceEvaluationWorkspace.jsx','BillingSubscriptions.jsx','NigeriaPayrollSupplementWorkspace.jsx','EmployeeLeaveProfilePanel.jsx','EmployeeLeaveProfileSelector.jsx']);
export function demoIsolation(){return {
 name:'northstar-demo-policy-boundary',enforce:'pre',apply:'build',
 buildStart(){fs.rmSync(path.resolve('dist'),{recursive:true,force:true});},
 transform(code,id){
  if(!id.includes('/src/'))return null;
  if(path.basename(id)==='BillingSubscriptions.jsx')return {code:`export {default} from ${JSON.stringify(path.resolve('src/demo/DemoBillingSubscriptions.jsx'))};`,map:null};
  if(path.basename(id)==='Loans.jsx')return {code:`export {default} from ${JSON.stringify(path.resolve('src/demo/NorthstarLoans.jsx'))};`,map:null};
  if(path.basename(id)==='SalaryAdvancesManaged.jsx')return {code:`export {default} from ${JSON.stringify(path.resolve('src/demo/NorthstarSalaryAdvances.jsx'))};`,map:null};
  if(excluded.has(path.basename(id)))return {code:`export {default} from ${JSON.stringify(path.resolve('src/demo/DemoPolicyWorkspace.jsx'))};`,map:null};
  if(id.endsWith('.css'))return {code:code.replace(/zermatt/gi,'demo'),map:null};
  if(/\.[jt]sx?(?:\?|$)/.test(id))return transformSync(code,{filename:id.split('?')[0],babelrc:false,configFile:false,parserOpts:{plugins:['jsx']},plugins:[demoTextBoundary],sourceMaps:false});
  return null;
 },
 writeBundle(options){const root=options.dir||'dist';fs.rmSync(path.join(root,'zrt-logo.jpeg'),{force:true});},
 closeBundle(){
  const bad=[];const walk=dir=>{for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())walk(file);else if(/\.(js|css|html|json)$/.test(file)&&/zermatt|beer barn|ZLL-PE|ZLL-PROB|chris-zermatt|chris\.crnetwork\.com\.ng/i.test(fs.readFileSync(file,'utf8')))bad.push(file);}};
  walk(path.resolve('dist'));if(bad.length)throw Error('Demo isolation audit rejected customer content in: '+bad.join(', '));
 }

};}
export function demoTextBoundary(){return {visitor:{
 StringLiteral(p){
  if(p.parentPath.isImportDeclaration()||p.parentPath.isExportNamedDeclaration()||p.parentPath.isExportAllDeclaration()||p.node.value.startsWith('./')||p.node.value.startsWith('../'))return;
  const value=p.node.value;
  if(/chris\.crnetwork\.com\.ng/i.test(value))p.node.value=value.replace(/https?:\/\/(?:www\.)?chris\.crnetwork\.com\.ng/gi,'https://chris-sales-demo.onrender.com');
  if(/zermatt-liquor-limited/i.test(value))p.node.value='disabled-customer-policy';
  else if(/zermatt|beer barn|ZLL-PE|ZLL-PROB/i.test(value))p.node.value=value.startsWith('/')?'/demo-policy-disabled':'Independent demo configuration';
 },
 JSXText(p){if(/zermatt|beer barn|ZLL-PE|ZLL-PROB/i.test(p.node.value))p.node.value=' Independent demo configuration. Customer-specific policies are not included. ';},
 TemplateElement(p){p.node.value.raw=p.node.value.raw.replace(/Zermatt Liquor Limited|ZERMATT|Zermatt|Beer Barn/gi,'Demo organization').replace(/https?:\/\/chris\.crnetwork\.com\.ng/gi,'https://chris-sales-demo.onrender.com');if(p.node.value.cooked!=null)p.node.value.cooked=p.node.value.raw;}
}};}
