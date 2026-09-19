"""Build the offline Android package with official Android build tools and ECJ.
Usage: python mobile/build-apk.py ANDROID_TOOLS_DIR ANDROID_JAR ECJ_JAR KEYSTORE OUTPUT_APK
Keep the signing keystore private and reuse it for future updates.
"""
import pathlib,sys,subprocess,shutil,zipfile,os
root=pathlib.Path(__file__).resolve().parent
if len(sys.argv)!=6:raise SystemExit(__doc__)
tools,platform,ecj,keystore,output=map(lambda p:pathlib.Path(p).resolve(),sys.argv[1:])
native=root/'native';build=native/'build'
shutil.rmtree(build,ignore_errors=True);build.mkdir()
for d in ['classes','dex','assets/web']:(build/d).mkdir(parents=True,exist_ok=True)
shutil.copytree(root/'dist',build/'assets/web',dirs_exist_ok=True)
# Preserve notices for the open-source runtime packages included in the web bundle.
licenses=[]
for p in [*(root.parent/'node_modules/.pnpm').glob('*/node_modules/*/LICENSE*'), *(root.parent/'node_modules/.pnpm').glob('*/node_modules/@*/*/LICENSE*')]:
 if p.is_file():
  try:licenses.append(str(p.relative_to(root.parent/'node_modules/.pnpm'))+'\n'+p.read_text())
  except UnicodeDecodeError:pass
(build/'assets/web/third-party-notices.txt').write_text('\n\n'.join(licenses))
def run(args):subprocess.run([str(x) for x in args],check=True)
for name in ['aapt2','d8','zipalign','apksigner']:(tools/name).chmod(0o755)
run(['java','-jar',ecj,'-source','8','-target','8','-classpath',platform,'-d',build/'classes',*native.glob('src/**/*.java')])
run([tools/'d8','--release','--min-api','29','--lib',platform,'--output',build/'dex',*list((build/'classes').rglob('*.class'))])
run([tools/'aapt2','compile','--dir',native/'res','-o',build/'resources.zip'])
run([tools/'aapt2','link','-o',build/'unsigned.apk','-I',platform,'--manifest',native/'AndroidManifest.xml','-A',build/'assets','-R',build/'resources.zip','--auto-add-overlay'])
with zipfile.ZipFile(build/'unsigned.apk','a',zipfile.ZIP_DEFLATED) as z:
 for p in (build/'dex').glob('*.dex'):z.write(p,p.name)
if not keystore.exists():
 keystore.parent.mkdir(parents=True,exist_ok=True)
 run(['keytool','-genkeypair','-keystore',keystore,'-storepass','android','-keypass','android','-alias','androiddebugkey','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=Zeitblick Test, O=Zeitblick, C=DE'])
run([tools/'zipalign','-f','4',build/'unsigned.apk',build/'aligned.apk'])
output.parent.mkdir(parents=True,exist_ok=True)
run([tools/'apksigner','sign','--ks',keystore,'--ks-pass','pass:android','--key-pass','pass:android','--out',output,build/'aligned.apk'])
run([tools/'apksigner','verify','--verbose',output])
run([tools/'aapt2','dump','badging',output])
print('APK ready:',output)
