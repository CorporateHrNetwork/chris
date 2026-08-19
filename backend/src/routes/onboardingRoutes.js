const express=require("express");
const prisma=require("../config/prisma");
const {requireAuth,requirePermission}=require("../middleware/authMiddleware");
const router=express.Router();
router.use(requireAuth);

const DEFAULT_SECTIONS=[
{key:"personal-details",label:"Personal Details",required:true,items:["Name","Phone Number","Email Address","Gender","Date of Birth","Marital Status","Nationality","Address","ID Details"]},
{key:"statutory-details",label:"Statutory Details",required:true,items:["Tax / PAYE Information","Pension / PFA / PIN","NHIA / Health Information","Other Statutory Requirements"]},
{key:"payment-details",label:"Payment Details",required:true,items:["Bank Name","Account Name","Account Number","Payroll Currency","Payment Method"]},
{key:"documents",label:"Documents",required:true,items:["CV / Resume","Offer / Appointment Letter","Valid ID","Certificates","Passport Photograph","Other Required Documents"]},
{key:"next-of-kin",label:"Next of Kin",required:true,items:["Name","Relationship","Phone Number","Address"]},
{key:"emergency-contact",label:"Emergency Contact",required:true,items:["Name","Relationship","Phone Number","Alternative Phone"]},
{key:"legal",label:"Legal",required:true,items:["Employment Contract","Confidentiality / NDA","Policy Acknowledgements","Data Privacy Consent"]},
{key:"assets",label:"Assets",required:false,items:["Laptop / Computer","Phone","ID / Access Card","PPE","Other Assigned Assets"]},
];

function normalizeSections(value){
 if(!Array.isArray(value)||!value.length)return DEFAULT_SECTIONS.map((s,i)=>({...s,order:i+1}));
 return value.map((s,i)=>({key:String(s?.key||`section-${i+1}`).trim(),label:String(s?.label||`Section ${i+1}`).trim(),description:s?.description?String(s.description).trim():null,required:s?.required!==false,order:Number(s?.order||i+1),items:Array.isArray(s?.items)?s.items.map(x=>String(x||"").trim()).filter(Boolean):[]}));
}
function initialSectionProgress(sections){return sections.reduce((acc,s)=>{acc[s.key]={label:s.label,required:s.required!==false,completed:false,completedItems:0,totalItems:Array.isArray(s.items)?s.items.length:0};return acc;},{});}

function normalizePersonalGender(value) {
  const normalized =
    String(value || "")
      .trim()
      .toUpperCase();

  return [
    "MALE",
    "FEMALE",
    "OTHER",
    "UNSPECIFIED",
  ].includes(normalized)
    ? normalized
    : "UNSPECIFIED";
}

function splitPersonalName(value) {
  const parts =
    String(value || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  return {
    firstName: parts[0],
    middleName:
      parts.length > 2
        ? parts.slice(1, -1).join(" ")
        : null,
    lastName: parts[parts.length - 1],
  };
}

function buildPersonalCompletion(data) {
  const completedItemKeys = [];

  if (String(data.fullName || "").trim()) {
    completedItemKeys.push("Name");
  }

  if (String(data.phone || "").trim()) {
    completedItemKeys.push("Phone Number");
  }

  if (String(data.email || "").trim()) {
    completedItemKeys.push("Email Address");
  }

  if (
    data.gender &&
    data.gender !== "UNSPECIFIED"
  ) {
    completedItemKeys.push("Gender");
  }

  if (data.dateOfBirth) {
    completedItemKeys.push("Date of Birth");
  }

  if (data.maritalStatus) {
    completedItemKeys.push("Marital Status");
  }

  if (String(data.nationality || "").trim()) {
    completedItemKeys.push("Nationality");
  }

  if (String(data.residentialAddress || "").trim()) {
    completedItemKeys.push("Address");
  }

  if (
    String(data.idType || "").trim() &&
    String(data.idNumber || "").trim()
  ) {
    completedItemKeys.push("ID Details");
  }

  return completedItemKeys;
}

function calculateProgress(sections,progress){const req=sections.filter(s=>s.required!==false);if(!req.length)return 100;const done=req.filter(s=>progress?.[s.key]?.completed===true).length;return Math.round(done/req.length*100);}

router.get("/templates",requirePermission("employees.view"),async(req,res)=>{try{const data=await prisma.onboardingWorkflowTemplate.findMany({where:{organizationId:req.auth.organizationId},orderBy:[{isActive:"desc"},{createdAt:"desc"}]});return res.json({status:"success",data});}catch(error){console.error(error);return res.status(500).json({status:"error",message:"Unable to load onboarding workflows."});}});

router.post("/templates",requirePermission("employees.update"),async(req,res)=>{try{const name=String(req.body?.name||"").trim();if(!name)return res.status(400).json({status:"error",message:"Onboarding workflow name is required."});const sections=normalizeSections(req.body?.sections);const code=String(req.body?.code||name.toUpperCase().replace(/[^A-Z0-9]+/g,"_").replace(/^_+|_+$/g,""));const data=await prisma.onboardingWorkflowTemplate.create({data:{organizationId:req.auth.organizationId,name,code,employmentType:req.body?.employmentType?String(req.body.employmentType).trim():null,sections,isActive:req.body?.isActive!==false,createdByUserId:req.auth.userId||null}});return res.status(201).json({status:"success",message:"Onboarding workflow created successfully.",data});}catch(error){console.error(error);if(error.code==="P2002")return res.status(409).json({status:"error",message:"An onboarding workflow already uses this name or code."});return res.status(500).json({status:"error",message:"Unable to create onboarding workflow."});}});

router.get("/status",requirePermission("employees.view"),async(req,res)=>{try{const data=await prisma.employeeOnboarding.findMany({where:{organizationId:req.auth.organizationId},include:{employee:{select:{id:true,employeeNumber:true,firstName:true,middleName:true,lastName:true,email:true,phone:true,gender:true,status:true,hireDate:true,confirmationDate:true}},template:true,assignedTo:{select:{id:true,firstName:true,lastName:true,email:true}},createdBy:{select:{id:true,firstName:true,lastName:true,email:true}}},orderBy:{updatedAt:"desc"}});return res.json({status:"success",data});}catch(error){console.error(error);return res.status(500).json({status:"error",message:"Unable to load onboarding status."});}});

router.post("/:employeeNumber",requirePermission("employees.update"),async(req,res)=>{try{const organizationId=req.auth.organizationId;const employee=await prisma.employee.findFirst({where:{organizationId,employeeNumber:req.params.employeeNumber}});if(!employee)return res.status(404).json({status:"error",message:"Employee not found."});const template=await prisma.onboardingWorkflowTemplate.findFirst({where:{id:req.body?.templateId,organizationId,isActive:true}});if(!template)return res.status(400).json({status:"error",message:"Select an active onboarding workflow."});const existing=await prisma.employeeOnboarding.findFirst({where:{organizationId,employeeId:employee.id,status:{not:"COMPLETED"}}});if(existing)return res.status(409).json({status:"error",message:"This employee already has an active onboarding process."});const sections=normalizeSections(template.sections);const sectionProgress=initialSectionProgress(sections);const data=await prisma.employeeOnboarding.create({data:{organizationId,employeeId:employee.id,templateId:template.id,assignedToUserId:req.auth.userId||null,createdByUserId:req.auth.userId||null,status:"IN_PROGRESS",completionPercent:0,currentStage:sections[0]?.label||null,sectionProgress,startedAt:new Date()},include:{employee:true,template:true}});return res.status(201).json({status:"success",message:"Employee onboarding started successfully.",data});}catch(error){console.error(error);return res.status(500).json({status:"error",message:"Unable to start employee onboarding."});}});

router.patch(
  "/records/:id/sections/:sectionKey",
  requirePermission("employees.update"),
  async (req, res) => {
    try {
      const onboarding =
        await prisma.employeeOnboarding.findFirst({
          where: {
            id: req.params.id,
            organizationId:
              req.auth.organizationId,
          },
          include: {
            template: true,
            employee: {
              include: {
                user: true,
              },
            },
          },
        });

      if (!onboarding) {
        return res.status(404).json({
          status: "error",
          message:
            "Employee onboarding record not found.",
        });
      }

      const sections =
        normalizeSections(
          onboarding.template.sections
        );

      const section =
        sections.find(
          (item) =>
            item.key ===
            req.params.sectionKey
        );

      if (!section) {
        return res.status(404).json({
          status: "error",
          message:
            "Onboarding section not found.",
        });
      }

      const sectionProgress = {
        ...(onboarding.sectionProgress || {}),
      };

      const sectionData = {
        ...(onboarding.sectionData || {}),
      };

      const previous =
        sectionProgress[
          req.params.sectionKey
        ] || {};

      let completedItemKeys =
        Array.isArray(
          req.body?.completedItemKeys
        )
          ? req.body.completedItemKeys
              .map((item) =>
                String(item || "").trim()
              )
              .filter(Boolean)
          : Array.isArray(
              previous.completedItemKeys
            )
            ? previous.completedItemKeys
            : [];

      let completed =
        req.body?.completed === true;

      let completedItems =
        Number(
          req.body?.completedItems || 0
        );

      if (
        req.params.sectionKey ===
        "personal-details"
      ) {
        const personal = {
          ...(
            sectionData[
              "personal-details"
            ] || {}
          ),
          ...(req.body?.data || {}),
        };

        const normalizedName =
          splitPersonalName(
            personal.fullName
          );

        if (!normalizedName) {
          return res.status(400).json({
            status: "error",
            message:
              "Enter at least the employee's first and last name.",
          });
        }

        const normalizedEmail =
          String(
            personal.email || ""
          )
            .trim()
            .toLowerCase();

        const normalizedPhone =
          String(
            personal.phone || ""
          ).trim();

        if (
          !normalizedEmail ||
          !normalizedPhone
        ) {
          return res.status(400).json({
            status: "error",
            message:
              "Email address and phone number are required.",
          });
        }

        const duplicateEmail =
          await prisma.employee.findFirst({
            where: {
              organizationId:
                req.auth.organizationId,
              email: normalizedEmail,
              NOT: {
                id:
                  onboarding.employeeId,
              },
            },
            select: {
              id: true,
            },
          });

        if (duplicateEmail) {
          return res.status(409).json({
            status: "error",
            message:
              "Another employee already uses this email address.",
          });
        }

        personal.fullName = [
          normalizedName.firstName,
          normalizedName.middleName,
          normalizedName.lastName,
        ]
          .filter(Boolean)
          .join(" ");

        personal.email =
          normalizedEmail;

        personal.phone =
          normalizedPhone;

        personal.gender =
          normalizePersonalGender(
            personal.gender
          );

        sectionData[
          "personal-details"
        ] = personal;

        completedItemKeys =
          buildPersonalCompletion(
            personal
          );

        completedItems =
          completedItemKeys.length;

        completed =
          completedItems >=
          section.items.length;

        await prisma.$transaction(
          async (tx) => {
            await tx.employee.update({
              where: {
                id:
                  onboarding.employeeId,
              },
              data: {
                firstName:
                  normalizedName.firstName,
                middleName:
                  normalizedName.middleName,
                lastName:
                  normalizedName.lastName,
                email:
                  normalizedEmail,
                phone:
                  normalizedPhone,
                gender:
                  personal.gender,
              },
            });

            if (
              onboarding.employee.user?.id
            ) {
              await tx.user.update({
                where: {
                  id:
                    onboarding.employee.user?.id,
                },
                data: {
                  firstName:
                    normalizedName.firstName,
                  lastName:
                    normalizedName.lastName,
                  email:
                    normalizedEmail,
                },
              });
            }
          }
        );
      }

      sectionProgress[
        req.params.sectionKey
      ] = {
        ...previous,
        completed,
        completedItems,
        completedItemKeys,
        totalItems:
          Array.isArray(section.items)
            ? section.items.length
            : Number(
                previous.totalItems || 0
              ),
        updatedAt:
          new Date().toISOString(),
        updatedByUserId:
          req.auth.userId || null,
      };

      const completionPercent =
        calculateProgress(
          sections,
          sectionProgress
        );

      const nextSection =
        sections.find(
          (item) =>
            sectionProgress[
              item.key
            ]?.completed !== true
        );

      const onboardingCompleted =
        completionPercent === 100;

      const data =
        await prisma.employeeOnboarding.update({
          where: {
            id:
              onboarding.id,
          },
          data: {
            sectionProgress,
            sectionData,
            completionPercent,
            currentStage:
              onboardingCompleted
                ? "Completed"
                : nextSection?.label ||
                  onboarding.currentStage,
            status:
              onboardingCompleted
                ? "COMPLETED"
                : "IN_PROGRESS",
            completedAt:
              onboardingCompleted
                ? new Date()
                : null,
            completedByUserId:
              onboardingCompleted
                ? req.auth.userId ||
                  null
                : null,
          },
          include: {
            employee: true,
            template: true,
          },
        });

      return res.json({
        status: "success",
        message:
          req.params.sectionKey ===
          "personal-details"
            ? "Personal details saved successfully."
            : "Onboarding section updated.",
        data,
      });
    } catch (error) {
      console.error(
        "Update onboarding section error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Unable to update onboarding section.",
      });
    }
  }
);
module.exports=router;
