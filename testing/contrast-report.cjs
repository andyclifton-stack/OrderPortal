const fs=require('fs'),path=require('path');
const folder=path.resolve(__dirname,'../../implementation-backups/contrast-20260907');
const rows=JSON.parse(fs.readFileSync(path.join(folder,'results.json')));
function rgb(s){if(s.startsWith('#'))return [1,3,5].map(i=>parseInt(s.slice(i,i+2),16));return s.match(/[\d.]+/g).slice(0,3).map(Number);}
function lum(c){return c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);}
function ratio(a,b){const x=lum(rgb(a)),y=lum(rgb(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
const failures=[],values={reviewedText:[],edges:[],icons:[],charts:[],chartText:[],focus:[],switchThumb:[]};let autoPass=0,reviewed=0;
for(const r of rows){
 autoPass+=r.passes;
 for(const v of r.violations)for(const n of v.nodes)failures.push({state:r.state,target:n.target,reason:n.failureSummary});
 for(const m of r.manual){for(const [key,category,min] of [['text','reviewedText',4.5],['edge','edges',3],['icon','icons',3]])if(m[key]!==null){values[category].push(m[key]);if(m[key]<min)failures.push({state:r.state,target:m.target,kind:key,ratio:m[key]});}}
 for(const m of r.reviewed){reviewed++;const score=ratio(m.color,m.background);values.reviewedText.push(score);if(score<4.5)failures.push({state:r.state,target:m.target,kind:'reviewed',ratio:score,colors:m});}
 if(r.charts){const c=r.charts,bg=c.dark?'#1f2937':'#ffffff';for(const color of [c.bar,...c.segments]){const score=ratio(color,bg);values.charts.push(score);if(score<3)failures.push({state:r.state,kind:'chart',color,ratio:score});}for(const color of [c.ticks,c.legend]){const score=ratio(color,bg);values.chartText.push(score);if(score<4.5)failures.push({state:r.state,kind:'chart-text',ratio:score});}}
}
for(const [fg,bg] of [['#283583','#f4f6f9'],['#8da9ff','#1f2937']]){const score=ratio(fg,bg);values.focus.push(score);if(score<3)failures.push({kind:'focus',ratio:score});}
for(const bg of ['#505c6d','#283583','#3c69b4']){const score=ratio('#ffffff',bg);values.switchThumb.push(score);if(score<3)failures.push({kind:'switch-thumb',ratio:score});}
const minima=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,{count:v.length,min:v.length?Math.min(...v):null}]));
const summary={snapshots:rows.length,automatedPassingTextChecks:autoPass,reviewedChecks:reviewed,minima,failures};
fs.writeFileSync(path.join(folder,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
if(failures.length)process.exitCode=1;
