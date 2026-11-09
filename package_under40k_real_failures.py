import sys,json,re,hashlib,zipfile,statistics
from pathlib import Path
from collections import Counter
from datetime import datetime,timezone
root=Path(r'D:\组内工作\career\Career-Agent'); base=root/'trajectory_gen'; sys.path[:0]=[str(base/'scripts'),str(base/'reports/sft-sample-100-20261022/.deps')]
from audit_plan_trajectories import audit_run,check_messages,credential_markers,load
from assess_business_outcomes import outcomes
from assess_qwen36_training import check_ids
from export_sft_sample import clean_messages,native_messages,validation_groups,write_jsonl
from prepare_training_data import validate_dataset
from tokenizers import Tokenizer
from jinja2.sandbox import ImmutableSandboxedEnvironment
import jsonschema
assets=base/'reports/sft-shortest-100-20261026/assets'; out=base/'reports/sft-under-40k-real-failures-20261027-v1'; archive=out.with_suffix('.zip')
if out.exists() or archive.exists(): raise RuntimeError('Output already exists')
expected={'chat_template.jinja':'e84f32a23fdda27689f868aa4a1a5621f41133e51a48d7f3efcbea2839574259','tokenizer.json':'5f9e4d4901a92b997e463c1f46055088b6cca5ca61a6522d1b9f64c4bb81cb42'}
for k,v in expected.items():
 if hashlib.sha256((assets/k).read_bytes()).hexdigest()!=v: raise ValueError('asset mismatch')
env=ImmutableSandboxedEnvironment(trim_blocks=True,lstrip_blocks=True); env.filters['tojson']=lambda v,**kw:json.dumps(v,ensure_ascii=False,**kw)
def fail(x): raise ValueError(x)
env.globals['raise_exception']=fail; template=env.from_string((assets/'chat_template.jinja').read_text(encoding='utf-8')); tokenizer=Tokenizer.from_file(str(assets/'tokenizer.json'))
cutoff=datetime.now(timezone.utc).isoformat(); traj=base/'trajectories'; files=list(traj.rglob('*.qwen3_5_sft.jsonl'))
files.sort(key=lambda p:(0 if 'syn-tasks' in p.parts else 1,str(p)))
reqs=list(traj.rglob('*.expectations.json')); req_index={}
for p in reqs: req_index.setdefault(p.name,[]).append(p)
counts=Counter(); reasons=Counter(); selected=[]; seen_ids=set(); seen_hash=set(); lengths=[]; contexts=Counter()
for i,p in enumerate(files,1):
 counts['source_exports']+=1; folder=p.parent; rid=p.name.removesuffix('.qwen3_5_sft.jsonl')
 try:
  summary=load(folder/'summary.json')
  if summary.get('runId')!=rid: counts['unmatched_summary']+=1; continue
  if rid in seen_ids: counts['duplicate_run_id']+=1; continue
  run=load(folder/'run.json'); paths=req_index.get(folder.name+'.expectations.json',[])
  paths=sorted(paths,key=lambda x:(0 if x.parent==folder.parent.parent/'requests' else 1,str(x)))
  match=next((x for x in paths if load(x).get('taskId')==run.get('taskId')),None)
  row=audit_run(folder,match.parent if match else folder)
  ignored={'producer_not_ready','structural_gate_rejected','semantic_gate_rejected','validation_gate_rejected','expected_tool_sequence_not_met','semantic_expectation_count_mismatch','missing_or_invalid:validation','missing_or_invalid:tool_expectations','invalid_or_empty_expected_tools','expectation_identity_mismatch','user_immediately_after_tool_response'}
  fatal=[x for x in row['issues'] if x not in ignored]
  if fatal:
   counts['audit_rejected']+=1; reasons.update(fatal); continue

  data=load(folder/(rid+'.qwen3_5_sft.json')); messages=clean_messages(data['messages']); tools=data['tools']; tools=json.loads(tools) if isinstance(tools,str) else tools
  if [x for x in check_messages(messages,tools)[0] if x != 'user_immediately_after_tool_response'] or credential_markers(json.dumps({'messages':messages,'tools':tools},ensure_ascii=False)):
   counts['cleaned_structure_or_credentials']+=1; continue
  tags=set(tag for m in messages if m['role']=='tool_response' for tag in outcomes(m['content']))

  original=load(folder/(rid+'.messages.json')).get('messages_list')
  if not original or check_ids(original)[0]: counts['source_call_id_error']+=1; continue
  native=native_messages(messages)
  if check_ids(native)[0]: counts['native_call_id_error']+=1; continue
  rendered=template.render(messages=native,tools=tools,add_generation_prompt=False,enable_thinking=False,preserve_thinking=False,add_vision_id=False)
  n=len(tokenizer.encode(rendered,add_special_tokens=False).ids); lengths.append(n)
  if n>=40000: counts['at_or_above_40000']+=1; continue
  digest=row['dataset_sha256']
  if digest in seen_hash: counts['duplicate_content']+=1; continue
  seen_ids.add(rid); seen_hash.add(digest)
  context='compacted' if data.get('contextMigration') else 'unmarked'
  contexts[context]+=1
  selected.append((row,p,messages,tools,native,n,context)); counts['selected']+=1
  if row['tool_errors']: counts['included_with_tool_errors']+=1
  if tags & {'error','insufficient_input','partial'}: counts['included_with_business_failure_or_partial']+=1
 except (OSError,ValueError,TypeError,KeyError,AttributeError,IndexError,jsonschema.exceptions.ValidationError,jsonschema.exceptions.SchemaError) as e:
  counts['processing_error']+=1; reasons['processing_'+type(e).__name__]+=1
 if i%100==0: print('scanned',i,'selected',len(selected),flush=True)
if not selected: raise RuntimeError('No eligible samples')
groups={x[0]['split_group'] for x in selected}; val=validation_groups(groups,.1,20261027); records=[]
for row,p,msg,tools,native,n,context in selected:
 records.append({'run_id':row['run_id'],'task_id':row['task_id'],'source':str(p.relative_to(root)).replace('\\','/'),'source_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'split_group':row['split_group'],'split':'validation' if row['split_group'] in val else 'train','context_tokens':n,'context_version':context,'has_tool_errors':bool(row['tool_errors']),'business_failure_or_partial':bool(set(tag for m in msg if m['role']=='tool_response' for tag in outcomes(m['content'])) & {'error','insufficient_input','partial'})})
out.mkdir(parents=True)
for fmt in ('ms_swift','qwen_native'):
 (out/fmt).mkdir()
 rows=[{'messages':x[2],'tools':json.dumps(x[3],ensure_ascii=False)} if fmt=='ms_swift' else {'messages':x[4],'tools':x[3]} for x in selected]
 for split in ('all','train','validation'): write_jsonl(out/fmt/(split+'.jsonl'),[r for r,m in zip(rows,records) if split=='all' or m['split']==split])
write_jsonl(out/'sample_manifest.jsonl',records)
result={'samples':len(records),'max_tokens':max(x['context_tokens'] for x in records),'group_overlap':len({x['split_group'] for x in records if x['split']=='train'} & {x['split_group'] for x in records if x['split']=='validation'}),'tokenizer_validation':'Qwen template and tokenizer; measured during selection','tool_call_linkage':'validated','tool_schema_arguments':'not required','training_loader_or_forward_pass':'not run'}
assert result['group_overlap']==0 and result['max_tokens']<40000
(out/'training_validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
nums=[x['context_tokens'] for x in records]; splits=Counter(x['split'] for x in records)
manifest={'cutoff_utc':cutoff,'scope':'trajectory_gen/trajectories exported conversations with matching summary and expectations; tool and business failures allowed','counts':dict(counts),'audit_issue_counts':dict(reasons),'splits':dict(splits),'groups':len(groups),'context_versions':dict(contexts),'length':{'min':min(nums),'max':max(nums),'mean':round(statistics.mean(nums),2),'median':statistics.median(nums),'distribution':{f'{lo//1000}k-{(lo+5000)//1000}k':sum(lo<=n<lo+5000 for n in nums) for lo in range(0,40000,5000)}},'tokenizer_assets_sha256':expected,'limit':'strictly less than 40000','limitations':['No new human review or model training/forward pass','Credential detection is not comprehensive','Unmatched historical summaries excluded', 'Tool arguments may violate schema; check loader compatibility','Context version inferred from export marker']}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(out/'README.md').write_text('# 40k 以下 SFT 训练轨迹\n\n允许工具和业务失败、部分结果；检查调用及结果顺序和关联。严格筛选 Qwen3.6 模板实际序列长度 < 40000，未截断。ms_swift 和 qwen_native 为同一批数据的两种格式；all 包含 train 和 validation，不要重复拼接。按来源组划分训练与验证。详细范围、筛选和限制见 manifest.json，逐条长度见 sample_manifest.jsonl。已验证调用关联、分组和 tokenizer；未要求工具参数符合 schema，未进行新的人工审核或模型训练。\n',encoding='utf-8')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in sorted(out.rglob('*')):
  if p.is_file(): z.write(p,p.relative_to(out).as_posix())
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 for name in z.namelist(): assert hashlib.sha256(z.read(name)).digest()==hashlib.sha256((out/name).read_bytes()).digest()
print(json.dumps({'archive':str(archive),'archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'manifest':manifest},ensure_ascii=False),flush=True)
