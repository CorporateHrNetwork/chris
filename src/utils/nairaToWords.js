// Convert approved monthly NGN gross to offer-letter words. Pure display helper;
// does not change compensation or payroll.
const SMALL=["Zero","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
const TENS=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
function underThousand(value) {
  if(value<20) return SMALL[value];
  if(value<100) return TENS[Math.floor(value/10)]+(value%10?" "+SMALL[value%10]:"");
  return SMALL[Math.floor(value/100)]+" Hundred"+(value%100?" and "+underThousand(value%100):"");
}
function words(value) {
  if(value===0)return "Zero";
  const parts=[];
  for (const [size,name] of [[1000000000,"Billion"],[1000000,"Million"],[1000,"Thousand"],[1,""]]) {
    if(value>=size) {
      const n=Math.floor(value/size);value%=size;
      parts.push(underThousand(n)+(name?" "+name:""));
    }
  }
  return parts.join(", ");
}
export function nairaToWords(value) {
  const raw=String(value??"").trim().replace(/^₦\s*/,"").replaceAll(",","");
  if(!/^(?:\d+)(?:\.\d{1,2})?$/.test(raw))return "";
  const amount=Number(raw);
  if(!Number.isFinite(amount)||amount<0||amount>=1000000000000)return "";
  const koboTotal=Math.round(amount*100);
  const naira=Math.floor(koboTotal/100);
  const kobo=koboTotal%100;
  return words(naira)+" Naira"+(kobo?" and "+words(kobo)+" Kobo":"")+" Only";
}
