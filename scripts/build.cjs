const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const ts=require('typescript'),AdmZip=require('adm-zip');
const root=path.resolve(__dirname,'..'),build=path.join(root,'build'),staging=path.join(build,'app'),dist=path.join(root,'dist','Kawaikara AI fork');
const runtime={tag:'v43.5.0+wvcus',url:'https://github.com/castlabs/electron-releases/releases/download/v43.5.0%2Bwvcus/electron-v43.5.0%2Bwvcus-win32-x64.zip',sha256:'f03a0bde2edfffa297a60962a66e5f5cafdb37b6ebb986c9d858994b89c8b6aa'};
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?walk(path.join(dir,item.name)):[path.join(dir,item.name)]);}
function compile(input,dest){const result=ts.transpileModule(fs.readFileSync(input,'utf8'),{fileName:input,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,emitDecoratorMetadata:true,esModuleInterop:true,removeComments:true},reportDiagnostics:true});if(result.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error))throw new Error('Compilation failed: '+path.relative(root,input));fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,result.outputText);}
const copied=new Set();
function folder(name,from){let dir=from;while(true){const candidate=path.join(dir,'node_modules',name);if(fs.existsSync(path.join(candidate,'package.json')))return fs.realpathSync(candidate);const parent=path.dirname(dir);if(dir===parent)throw new Error('Missing package '+name);dir=parent;}}
function copyPackage(name,from,targetParent){const src=folder(name,from),dest=path.join(targetParent,name),id=src+'>'+dest;if(copied.has(id))return;copied.add(id);const pkg=JSON.parse(fs.readFileSync(path.join(src,'package.json')));for(const file of walk(src).filter(f=>!path.relative(src,f).split(path.sep).includes('node_modules')&&!f.endsWith('.map'))){const target=path.join(dest,path.relative(src,file));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);}for(const dep of Object.keys(pkg.dependencies||{})){if(dep.startsWith('@types/'))continue;const depSrc=folder(dep,src),top=path.join(staging,'node_modules',dep),version=JSON.parse(fs.readFileSync(path.join(depSrc,'package.json'))).version;if(!fs.existsSync(top))copyPackage(dep,src,path.join(staging,'node_modules'));else if(JSON.parse(fs.readFileSync(path.join(top,'package.json'))).version!==version)copyPackage(dep,src,path.join(dest,'node_modules'));}}
(async()=>{
 if(process.platform!=='win32')throw new Error('This build script targets Windows x64');
 if(staging!==path.join(root,'build','app'))throw new Error('Invalid build directory');
 // Only generated staging files are removed. Existing dist/data is retained.
 fs.rmSync(staging,{recursive:true,force:true});fs.mkdirSync(staging,{recursive:true});fs.mkdirSync(dist,{recursive:true});
 const zipFile=path.join(build,'electron-43.5.0.zip');
 if(!fs.existsSync(zipFile)){const response=await fetch(runtime.url);if(!response.ok)throw new Error('Runtime download failed');fs.writeFileSync(zipFile,Buffer.from(await response.arrayBuffer()));}
 const bytes=fs.readFileSync(zipFile);if(crypto.createHash('sha256').update(bytes).digest('hex')!==runtime.sha256)throw new Error('Runtime checksum mismatch');
 const zip=new AdmZip(bytes);for(const entry of zip.getEntries()){const target=path.resolve(dist,entry.entryName);if(target!==dist&&!target.startsWith(dist+path.sep))throw new Error('Invalid archive path');}
 zip.extractAllTo(dist,true);
 fs.cpSync(path.join(root,'resources'),path.join(dist,'resources'),{recursive:true});
 fs.cpSync(path.join(root,'ui'),path.join(staging,'public/pages'),{recursive:true});
 for(const input of walk(path.join(root,'typescript_src')).filter(f=>f.endsWith('.ts')&&!f.endsWith('.d.ts')))compile(input,path.join(staging,'public',path.relative(path.join(root,'typescript_src'),input).replace(/\.ts$/,'.js')));
 fs.cpSync(path.join(root,'personal/pages'),path.join(staging,'public/pages'),{recursive:true});
 for(const file of ['bootstrap.cjs','security.cjs','extensions.cjs','extensions-preload.cjs'])fs.copyFileSync(path.join(root,'personal',file),path.join(staging,'public',file));
 const sourcePkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'))),pkg={...sourcePkg,main:'public/bootstrap.cjs'};delete pkg.devDependencies;delete pkg.scripts;
 for(const name of Object.keys(pkg.dependencies))copyPackage(name,root,path.join(staging,'node_modules'));
 fs.writeFileSync(path.join(staging,'package.json'),JSON.stringify(pkg,null,2));fs.copyFileSync(path.join(root,'LICENSE'),path.join(staging,'LICENSE'));
 execFileSync(path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:winexe','/reference:System.Windows.Forms.dll','/win32icon:'+path.join(root,'resources/icons/kawaikara.ico'),'/out:'+path.join(dist,'Kawaikara AI fork.exe'),path.join(root,'personal/Launcher.cs')]);
 const asar=await import(pathToFileURL(require.resolve('@electron/asar')).href);await asar.createPackage(staging,path.join(dist,'resources/app.asar'));
 console.log('Built dist/Kawaikara AI fork. Launch Kawaikara AI fork.exe.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
