import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const html=await readFile(path.join(root,'index.html'),'utf8');
const catalog=JSON.parse((await readFile(path.join(root,'data','equipamentos.json'),'utf8')).replace(/^\uFEFF/,''));
const errors=[];
const warnings=[];
const names=new Set();

for(const item of catalog.items){
  if(!item.name) errors.push('Registro sem nome no catálogo.');
  if(names.has(item.name)) errors.push(`Equipamento duplicado no JSON: ${item.name}`);
  names.add(item.name);
  if(item.image){
    try{
      await access(path.join(root,'assets','devices',item.image),constants.R_OK);
    }catch{
      errors.push(`Imagem ausente: ${item.name} -> ${item.image}`);
    }
  }else if(item.imageStatus!=='pending'){
    warnings.push(`Sem imagem e sem status pendente: ${item.name}`);
  }
}

const deviceArea=html.match(/<div id="tab-curral"[\s\S]*?<div id="tab-tratos"/)?.[0]||'';
const cardNames=[...deviceArea.matchAll(/<div class="device-name">([^<]+)<\/div>/g)].map(match=>match[1].trim());
for(const name of cardNames){
  if(!names.has(name)) errors.push(`Cartão sem registro no JSON: ${name}`);
}

const urls=[...new Set([...html.matchAll(/href="(https:[^"]+)"/g)].map(match=>match[1].replaceAll('&amp;','&')))];
for(const value of urls){
  try{ new URL(value); }catch{ errors.push(`URL inválida: ${value}`); }
}

if(process.argv.includes('--remote')){
  const checkLink=async url=>{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch(url,{method:'HEAD',redirect:'follow',signal:controller.signal});
      if(response.status>=400) warnings.push(`Link respondeu ${response.status}: ${url}`);
    }catch(error){
      warnings.push(`Link não verificado (${error.name}): ${url}`);
    }finally{
      clearTimeout(timeout);
    }
  };
  for(let index=0;index<urls.length;index+=10){
    await Promise.all(urls.slice(index,index+10).map(checkLink));
  }
}

const confirmed=catalog.items.filter(item=>item.image).length;
console.log(`Catálogo ${catalog.version}: ${catalog.items.length} registros, ${confirmed} com imagem.`);
console.log(`HTML: ${cardNames.length} cartões de equipamentos e ${urls.length} links externos válidos.`);
for(const warning of warnings) console.warn(`AVISO: ${warning}`);
for(const error of errors) console.error(`ERRO: ${error}`);
if(errors.length) process.exitCode=1;
