#!/usr/bin/env python3
import argparse,json,re,shutil,sys
from datetime import date
from pathlib import Path

def root(): return Path(__file__).resolve().parents[1]
def docs(): return root()/'docs'
def rel(path): return str(path.relative_to(root())).replace('\\','/')
def meta(path):
 text=path.read_text(encoding='utf-8',errors='ignore');out={}
 if text.startswith('---'):
  for line in text.split('---',2)[1].splitlines():
   if ':' in line:
    key,value=line.split(':',1);out[key.strip()]=value.strip().strip('"')
 return out
def set_status(path,status):
 text=path.read_text(encoding='utf-8');today=str(date.today())
 text=re.sub(r'(?m)^status:\s*.*$',f'status: {status}',text,count=1)
 text=re.sub(r'(?m)^updated:\s*.*$',f'updated: {today}',text,count=1)
 path.write_text(text,encoding='utf-8')
def find_id(doc_id):
 if not doc_id:return None
 for path in docs().rglob(f'{doc_id}*.md'):
  if 'archive' not in path.parts:return path
 print('文档不存在：',doc_id);return None
def next_id(kind):
 prefix=kind.upper();nums=[]
 for path in (docs()/kind).glob(f'{prefix}-*.md'):
  match=re.match(rf'{prefix}-(\d+)',path.name)
  if match:nums.append(int(match.group(1)))
 return f'{prefix}-{max(nums or [0])+1:03d}'
def slug(text): return re.sub(r'[\\/:*?"<>|\s]+','-',text).strip('-')
def append_index(path,row):
 path.parent.mkdir(parents=True,exist_ok=True)
 old=path.read_text(encoding='utf-8') if path.exists() else ''
 if row not in old:path.write_text(old.rstrip()+'\n'+row+'\n',encoding='utf-8')

def cmd_context(args):
 catalog=json.loads((docs()/'catalog.json').read_text(encoding='utf-8'));text=' '.join(filter(None,[args.text,args.topic,args.source])).lower();scores=[]
 for name,item in catalog['topics'].items():
  score=sum(1 for word in [name,*item.get('aliases',[])] if word.lower() in text)
  if score:scores.append((score,name,item))
 if not scores:print('低置信度：请补充任务对象，或使用 --topic/--from');return 2
 _,name,item=max(scores);print(json.dumps({'topic':name,'primary':f"docs/{item['primary']}",'related':[f'docs/{x}' for x in item.get('related',[])[:2]]},ensure_ascii=False));return 0

def cmd_new(args):
 kind=args.kind;source=args.source
 if kind=='plan':
  source_path=find_id(source)
  if not source_path:return 1
  title=meta(source_path).get('title',source_path.stem);topics=meta(source_path).get('topics','[]')
 else:
  if not args.title:print(f'缺少标题：new {kind} 需要提供标题参数，如 new {kind} 标题文本');return 1
  title=args.title;topics='['+', '.join(args.topics or [])+']'
 doc_id=next_id(kind);path=docs()/kind/f'{doc_id}-{slug(title)}.md';today=date.today()
 if kind=='plan':
  body=f'''---\nid: {doc_id}\ntitle: {title}实施计划\nstatus: pending\nsource: {source}\ntopics: {topics}\ncreated: {today}\nupdated: {today}\n---\n\n# {doc_id} {title}实施计划\n\n## 开发前知识检查\n- [ ] 已运行 context\n- [ ] 已阅读分类索引\n- [ ] 已阅读具体内容文档\n- [ ] 已记录代码图谱结果\n- [ ] 已确认框架优先方案\n\n### CLI 推荐索引\n\n### 已阅读内容文档\n\n### 代码图谱结果\n\n### 框架能力与结论\n- 结论：\n\n## 实施工单\n- WORK-{doc_id[5:]}-01：目标、允许文件、步骤、验证命令、停止条件\n\n## 测试与验证\n- [ ] 已运行要求的测试\n- 测试命令：\n- 测试结果：\n\n## 文档同步\n- [ ] 已更新来源 PRD 或 BUG\n- [ ] 已更新受影响项目文档\n- [ ] 已更新相关索引\n\n## 收口检查\n- [ ] 工单回执完整\n- [ ] 实施步骤全部完成\n- [ ] 测试通过并记录结果\n- [ ] 来源文档状态已更新\n- [ ] 受影响文档已更新\n- [ ] 索引已同步\n'''
 else:body=f'''---\nid: {doc_id}\ntitle: {title}\nstatus: draft\ntopics: {topics}\ncreated: {today}\nupdated: {today}\n---\n\n# {doc_id} {title}\n\n## 背景\n\n## 目标\n\n## 验收标准\n'''
 path.parent.mkdir(parents=True,exist_ok=True)
 path.write_text(body,encoding='utf-8');index={'prd':'index.md','adr':'index.md','bug':'bug-index.md','plan':'plan-index.md'}[kind];append_index(docs()/kind/index,f'| {doc_id} | [{title}]({path.name}) | {source or "-"} | {"pending" if kind=="plan" else "draft"} |');print(doc_id,path);return 0

def checked(path,section):
 text=path.read_text(encoding='utf-8')
 if section not in text:return False
 part=text.split(section,1)[1];return '- [ ]' not in part.split('\n## ',1)[0]
def cmd_start(args):
 path=find_id(args.id)
 if not path:return 1
 text=path.read_text(encoding='utf-8')
 for adr_path in re.findall(r'`(docs/adr/[^`]+[.]md)`',text):
  candidate=root()/adr_path
  if candidate.exists() and meta(candidate).get('status') in {'proposed','draft'}:print(f'关联 ADR 未确认：{adr_path}');return 3
 if not checked(path,'## 开发前知识检查') or '- 结论：\n' in text:print('开发前知识检查未完成');return 3
 set_status(path,'implementing');print('已开始',args.id);return 0
def cmd_close(args):
 path=find_id(args.id)
 if not path:return 1
 if not checked(path,'## 收口检查'):print('收口检查未完成');return 4
 set_status(path,'completed');source=meta(path).get('source');source_path=find_id(source) if source else None
 if source_path:set_status(source_path,'completed' if source.startswith('PRD') else 'resolved')
 print('已收口',args.id);return 0
def cmd_validate(_):
 broken=[]
 for path in docs().rglob('*.md'):
  for link in re.findall(r'\[[^]]*\]\(([^)#]+)',path.read_text(encoding='utf-8',errors='ignore')):
   if link.startswith(('http://','https://','mailto:','ftp://','data:')):continue
   if not (path.parent/link).resolve().exists():broken.append({'file':rel(path),'link':link})
 print(json.dumps({'broken_links':broken},ensure_ascii=False));return 5 if broken else 0
def cmd_status(_):
 result={}
 for folder,name in [('plan','plan-index.md'),('prd','index.md'),('adr','index.md')]:
  items=[]
  for path in sorted((docs()/folder).glob('*.md')):
   if '-000-' in path.name or path.name==name or path.name.startswith(('RECEIPT-','ACCEPTANCE-')):continue
   data=meta(path);match=re.match(r'([A-Z]+-\d+(?:-\d+)?)|(\d+)',path.stem)
   items.append({'id':data.get('id',match.group(0) if match else path.stem),'status':data.get('status','unknown')})
  if items:result[folder]=items
 print(json.dumps(result,ensure_ascii=False));return 0

def knowledge_dir(name):return docs()/'knowledge'/'frameworks'/name
def cmd_knowledge(args):
 if args.action=='list':
  base=docs()/'knowledge'/'frameworks';print('\n'.join(sorted(path.name for path in base.iterdir() if path.is_dir())) if base.exists() else '');return 0
 target=knowledge_dir(args.name)
 if args.action=='add':
  raw=target/'raw';raw.mkdir(parents=True,exist_ok=True);shutil.copytree(Path(args.source),raw,dirs_exist_ok=True)
  files=sorted(rel(path) for path in raw.rglob('*') if path.is_file())
  (target/'index.md').write_text(f'# {args.name} 本地知识索引\n\n- 版本：{args.version}\n- [项目用法](project-usage.md)\n\n## 主题导航\n'+'\n'.join(f'- `{x}`' for x in files)+'\n',encoding='utf-8')
  (target/'project-usage.md').write_text(f'# {args.name} 项目用法\n\n## 项目用途\n\n## 优先能力\n\n## 禁止方式\n',encoding='utf-8')
  append_index(docs()/'technology'/'index.md',f'| {args.name} | {args.version} | 待补充 | [本地知识](../knowledge/frameworks/{args.name}/index.md) | 待补充 |');append_index(docs()/'knowledge'/'index.md',f'| {args.name} | framework | {args.version} | [入口](frameworks/{args.name}/index.md) |');return 0
 if not target.exists():print('知识库不存在：',args.name);return 1
 if args.action=='show':print(rel(target/'index.md'));print(rel(target/'project-usage.md'));return 0
 files=sorted(path for path in (target/'raw').rglob('*') if path.is_file())
 if args.action=='topics':print('\n'.join(rel(path) for path in files));return 0
 if args.action=='find':
  query=args.query.lower();hits=[]
  for path in files:
   if query in path.name.lower() or query in path.read_text(encoding='utf-8',errors='ignore').lower():hits.append(rel(path))
  print('\n'.join(hits[:20]) if hits else '未命中：请换同义词，或先运行 knowledge topics');return 0 if hits else 2
 required=[target/'index.md',target/'project-usage.md',target/'raw'];missing=[rel(path) for path in required if not path.exists()];print(json.dumps({'name':args.name,'missing':missing,'files':len(files)},ensure_ascii=False));return 3 if missing or not files else 0

INDEXES={'adr':('index.md','ADR'),'prd':('index.md','PRD'),'plan':('plan-index.md','PLAN'),'bug':('bug-index.md','BUG')}
def table_rows(path):return [line for line in path.read_text(encoding='utf-8').splitlines() if line.startswith('| ') and not line.startswith('|---') and not re.match(r'\| (ID|文档)',line)]
def _rewrite_archive_row(row):
 # 索引行归档到 <kind>/archive/<year>.md 后，原相对文档链接需加 ../ 前缀；外链与已相对链接不改
 def repl(m):
  link=m.group(1)
  if link.startswith(('../','http://','https://','mailto:','ftp://','data:')):return m.group(0)
  return '](../'+link
 return re.sub(r'\]\(([^)#]+)',repl,row)
def cmd_index(args):
 if args.action=='check':
  issues=[]
  root_lines=len((docs()/'index.md').read_text(encoding='utf-8').splitlines())
  if root_lines>100:issues.append(f'docs/index.md {root_lines} 行，建议压缩')
  for folder,(name,_) in INDEXES.items():
   path=docs()/folder/name
   if path.exists():
    rows=table_rows(path);completed=sum(any(state in row.lower() for state in ['completed','resolved','accepted']) for row in rows)
    if len(rows)>10 and completed>10:issues.append(f'{rel(path)} 有 {len(rows)} 条，建议压缩')
  print('\n'.join(issues) if issues else '索引健康');return 2 if issues else 0
 if args.action=='compact':
  year=str(date.today().year)
  for folder,(name,_) in INDEXES.items():
   path=docs()/folder/name
   if not path.exists():continue
   lines=path.read_text(encoding='utf-8').splitlines();rows=table_rows(path)
   old=[_rewrite_archive_row(row) for row in rows if any(state in row.lower() for state in ['completed','resolved','accepted'])][:-10]
   if not old:continue
   archive=path.parent/'archive'/f'{year}.md';archive.parent.mkdir(parents=True,exist_ok=True)
   if not archive.exists():archive.write_text(f'# {year} {folder.upper()} 索引归档\n\n',encoding='utf-8')
   archive.write_text(archive.read_text(encoding='utf-8').rstrip()+'\n'+'\n'.join(old)+'\n',encoding='utf-8')
   path.write_text('\n'.join(line for line in lines if line not in old).rstrip()+f'\n\n- [历史归档](archive/{year}.md)\n',encoding='utf-8')
  print('索引已压缩，原文档路径未移动');return 0
 def row_file(row):
  m=re.search(r'\]\(([^)]+)\)',row);return m.group(1) if m else None
 skipped=[]
 for folder,(name,prefix) in INDEXES.items():
  index=docs()/folder/name
  if not index.exists():continue
  header={'ADR':'# ADR 索引\n\n| ID | 文档 | 状态 | 摘要 |\n|---|---|---|---|','PRD':'# PRD 索引\n\n| ID | 文档 | 状态 | 主题 |\n|---|---|---|---|','PLAN':'# PLAN 索引\n\n| ID | 文档 | 来源 | 状态 |\n|---|---|---|---|','BUG':'# BUG 索引\n\n| ID | 文档 | 严重程度 | 状态 |\n|---|---|---|---|'}[prefix]
  rows=[]
  for path in sorted((docs()/folder).glob(f'{prefix}-*.md')):
   if '-000-' in path.name or path.name==name:continue
   data=meta(path);match=re.match(r'([A-Z]+-\d+(?:-\d+)?)|(\d+)',path.stem)
   doc_id=data.get('id',match.group(0) if match else path.stem)
   title=data.get('title',path.stem);status=data.get('status','unknown')
   extra=data.get('source','-') if prefix=='PLAN' else data.get('summary',data.get('topics','-'))
   rows.append(f'| {doc_id} | [{title}]({path.name}) | {extra} | {status} |' if prefix=='PLAN' else f'| {doc_id} | [{title}]({path.name}) | {status} | {extra} |')
  generated={row_file(r) for r in rows};generated.discard(None)
  existing={row_file(r) for r in table_rows(index)};existing.discard(None)
  if existing-generated:
   skipped.append(rel(index));print(f'跳过 {rel(index)}：包含手工行（不在 {prefix} 前缀文档重建集合），不覆盖');continue
  index.write_text(header+'\n'+'\n'.join(rows)+'\n',encoding='utf-8')
 print('索引已从文档元数据重建'+('（跳过 %d 个手工索引）'%len(skipped) if skipped else ''));return 0

def _force_utf8_stdio():
 # CI Windows runner stdout 为 cp1252，含中文的 print 必抛 UnicodeEncodeError；统一重配置 UTF-8（replace 容错，不改变任何子命令行为）
 for stream in (sys.stdout,sys.stderr):
  try:
   reconfigure=getattr(stream,'reconfigure',None)
   if reconfigure and stream.encoding and stream.encoding.lower() not in ('utf-8','utf-8-sig'):reconfigure(encoding='utf-8',errors='replace')
  except Exception:pass

def main():
 _force_utf8_stdio()
 parser=argparse.ArgumentParser();subs=parser.add_subparsers(dest='cmd',required=True)
 context=subs.add_parser('context');context.add_argument('text',nargs='?',default='');context.add_argument('--topic');context.add_argument('--from',dest='source')
 new=subs.add_parser('new');new.add_argument('kind',choices=['adr','prd','bug','plan']);new.add_argument('title',nargs='?');new.add_argument('--from',dest='source');new.add_argument('--topics',nargs='*')
 for command in ['start','close']:item=subs.add_parser(command);item.add_argument('id')
 subs.add_parser('validate');subs.add_parser('status')
 knowledge=subs.add_parser('knowledge');actions=knowledge.add_subparsers(dest='action',required=True)
 add=actions.add_parser('add');add.add_argument('name');add.add_argument('source');add.add_argument('--version',default='unknown')
 actions.add_parser('list')
 for action in ['show','topics','check']:item=actions.add_parser(action);item.add_argument('name')
 find=actions.add_parser('find');find.add_argument('name');find.add_argument('query')
 index=subs.add_parser('index');index.add_subparsers(dest='action',required=True)
 for action in ['check','compact','rebuild']:index.add_subparsers if False else None
 index_actions=index._subparsers._group_actions[0]
 for action in ['check','compact','rebuild']:index_actions.add_parser(action)
 args=parser.parse_args();handlers={'context':cmd_context,'new':cmd_new,'start':cmd_start,'close':cmd_close,'validate':cmd_validate,'status':cmd_status,'knowledge':cmd_knowledge,'index':cmd_index};return handlers[args.cmd](args)
if __name__=='__main__':sys.exit(main())
