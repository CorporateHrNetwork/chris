const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { verifyGithubCelebrationToken } = require('../src/services/celebrationGithubOidc');
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'fixture', alg: 'RS256', use: 'sig' };
const claims = { iss:'https://token.actions.githubusercontent.com',aud:'chris-zermatt-celebrations',sub:'repo:CorporateHrNetwork/chris:ref:refs/heads/main',repository:'CorporateHrNetwork/chris',repository_id:'1318488623',repository_owner_id:'298755163',ref:'refs/heads/main',workflow_ref:'CorporateHrNetwork/chris/.github/workflows/zermatt-celebrations.yml@refs/heads/main',runner_environment:'github-hosted',event_name:'schedule',iat:1000,nbf:1000,exp:1300 };
const options={env:{CHRIS_CELEBRATION_GITHUB_OIDC_ENABLED:'true'},now:()=>1100000,loadKeys:async()=>[jwk]};
function sign(values={},header={}) {const parts=[{alg:'RS256',typ:'JWT',kid:'fixture',...header},{...claims,...values}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url'));return parts.join('.')+'.'+crypto.sign('RSA-SHA256',Buffer.from(parts.join('.')),privateKey).toString('base64url');}
test('accepts only signed short-lived tokens for exact trusted scheduled workflow',async()=>{
 assert.equal(await verifyGithubCelebrationToken(sign(),options),true);
 assert.equal(await verifyGithubCelebrationToken(sign({event_name:'workflow_dispatch'}),options),true);
 for(const invalid of [{aud:'other'},{repository_id:'999'},{repository_owner_id:'999'},{ref:'refs/heads/feature'},{sub:'other'},{workflow_ref:'other'},{event_name:'pull_request'},{exp:1000},{nbf:1200},{iat:100},{exp:2200}])assert.equal(await verifyGithubCelebrationToken(sign(invalid),options),false,JSON.stringify(invalid));
 assert.equal(await verifyGithubCelebrationToken(sign({}, {alg:'HS256'}),options),false);
 assert.equal(await verifyGithubCelebrationToken(sign().slice(0,-6)+'invalid',options),false);
 assert.equal(await verifyGithubCelebrationToken(sign(),{...options,env:{}}),false);
 assert.equal(await verifyGithubCelebrationToken(sign(),{...options,loadKeys:async()=>{throw new Error('outage')}}),false);
});
