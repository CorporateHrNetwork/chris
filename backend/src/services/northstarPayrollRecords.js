const { isNorthstar } = require('./northstarPayrollBasis');
const hasValue = value => String(value ?? '').trim() !== '';
function fillMissing(current, defaults) {
  const next = {...current};
  for (const [key,value] of Object.entries(defaults)) if (!hasValue(next[key])) next[key]=value;
  return next;
}
function fictionalSections(employee, current = {}) {
  const number = employee.employeeNumber;
  const suffix = number.match(/^NSD(\d{4})$/)?.[1];
  if (!suffix || !String(employee.email || '').endsWith('@northstar-demo.example')) return null;
  const statutory = current['statutory-details'] || current.statutoryDetails || {};
  const payment = current['payment-details'] || current.paymentDetails || {};
  return {...current,
    'statutory-details':fillMissing(statutory, {
      taxIdentificationNumber:`DEMO-TIN-${number}-NOT-VALID`,payeState:'FCT',
      pensionPfa:'Northstar Demonstration PFA (fictional)',pensionPfaCode:'DEMO',pensionPin:`DEMO-PIN-${number}-NOT-VALID`,
      nhfNumber:`DEMO-NHF-${number}-NOT-VALID`,nhiaStatus:'SAMPLE_REGISTERED',nhiaNumber:`DEMO-NHIA-${number}-NOT-VALID`,
      groupLifePolicyNumber:'DEMO-GROUP-LIFE-NOT-VALID',
      notes:'Fictional demonstration records only. Registration identifiers are not valid for remittance.',
      demoOnly:true,
    }),
    'payment-details':fillMissing(payment, {
      bankName:'Northstar Demonstration Bank (fictional)',
      accountName:[employee.firstName,employee.middleName,employee.lastName].filter(Boolean).join(' '),
      accountNumber:`000000${suffix}`,payrollCurrency:'NGN',paymentMethod:'BANK_TRANSFER',
      notes:'Fictional demonstration account only. No payment transmission.',demoOnly:true,
    }),
  };
}
async function ensureNorthstarPayrollRecords({organizationId,actorUserId,prismaClient}) {
  if (organizationId !== 'chris-demo-org-20261022') return {updated:0};
  const organization = await prismaClient.organization.findUnique({where:{id:organizationId},select:{slug:true}});
  if (!isNorthstar(organizationId,organization?.slug)) return {updated:0};
  return prismaClient.$transaction(async tx => {
    const employees=await tx.employee.findMany({where:{organizationId,status:{in:['ACTIVE','PROBATION','LEAVE','SUSPENDED']}},
      select:{id:true,employeeNumber:true,email:true,firstName:true,middleName:true,lastName:true}});
    let updated=0;
    for (const employee of employees) {
      const record=await tx.employeeOnboarding.findFirst({where:{organizationId,employeeId:employee.id},orderBy:[{updatedAt:'desc'},{createdAt:'desc'}]});
      const sections=fictionalSections(employee,record?.sectionData || {});
      if (!sections || JSON.stringify(sections) === JSON.stringify(record?.sectionData || {})) continue;
      if (record) await tx.employeeOnboarding.update({where:{organizationId_id:{organizationId,id:record.id}},data:{sectionData:sections}});
      else {
        const template=await tx.onboardingWorkflowTemplate.upsert({
          where:{organizationId_code:{organizationId,code:'NORTHSTAR-DEMO-PAYROLL-PROFILE'}},
          create:{organizationId,code:'NORTHSTAR-DEMO-PAYROLL-PROFILE',name:'Fictional payroll demonstration profile',sections:[
            {key:'statutory-details',label:'Statutory registration',required:true,items:[]},
            {key:'payment-details',label:'Payment details',required:true,items:[]},
          ]},update:{},select:{id:true},
        });
        await tx.employeeOnboarding.create({data:{organizationId,employeeId:employee.id,templateId:template.id,
          sectionData:sections,sectionProgress:{},status:'DRAFT',createdByUserId:actorUserId || null}});
      }
      await tx.organizationAudit.create({data:{organizationId,actorUserId:actorUserId || null,entityType:'NorthstarDemoPayrollProfile',
        entityId:employee.id,action:'SYNTHETIC_PAYROLL_RECORDS_COMPLETED',
        newValue:{employeeNumber:employee.employeeNumber,demoOnly:true},reason:'Complete missing fictional demo registration/payment fields for client exercises; preserve existing values.'}});
      updated++;
    }
    return {updated};
  },{timeout:30000});
}
module.exports={fictionalSections,ensureNorthstarPayrollRecords};
