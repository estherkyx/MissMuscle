import test from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES } from '../shared/exercises';
import { createExerciseSync } from '../src/features/video/exercise-motion';
import { referenceExercisePose } from '../src/features/video/exercise-pose';
import { drawMappedBody } from '../src/features/video/mapped-body';

test('all authored poses stay on canvas and show distinct exercise movement', () => {
  for (const { id } of EXERCISES) {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      for (const p of referenceExercisePose(id, t).filter(p => p.visibility)) {
        assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1, `${id}: ${JSON.stringify(p)}`);
      }
    }
    assert.notDeepEqual(referenceExercisePose(id, 0), referenceExercisePose(id, 0.5));
  }
  const length = (id: Parameters<typeof referenceExercisePose>[0], t: number, a: number, b: number) => {
    const p=referenceExercisePose(id,t);return Math.hypot((p[a].x-p[b].x)*3,(p[a].y-p[b].y)*4);
  };
  for(const id of ['leg_extension','dumbbell_front_squat'] as const) {
    for(const [a,b] of [[23,25],[25,27]]) assert.ok(Math.abs(length(id,0,a,b)-length(id,1,a,b))<1e-8);
  }
  const squat0=referenceExercisePose('dumbbell_front_squat',0), squat1=referenceExercisePose('dumbbell_front_squat',1);
  assert.deepEqual(squat0[27],squat1[27]);
  assert.ok(squat1[23].y>squat0[23].y);
  assert.deepEqual(referenceExercisePose('leg_extension',0)[23],referenceExercisePose('leg_extension',1)[23]);
});

test('each tracker follows movement, holds, reverses, and rejects missing or ambiguous poses', () => {
  for(const {id} of EXERCISES) {
    const sync=createExerciseSync(id);
    const low=referenceExercisePose(id,0), high=referenceExercisePose(id,0.5);
    const a=sync.update([low],300,400,0)!;
    const b=sync.update([high],300,400,0.1)!;
    assert.ok(a && b, id);
    assert.ok(b.progress>a.progress,id);
    assert.notEqual(b.direction,'Holding');
    assert.equal(sync.update([high],300,400,0.2)!.direction,'Holding');
    assert.notEqual(sync.update([low],300,400,0.3)!.direction,b.direction);
    assert.equal(sync.update([],300,400,0.4),null);
    assert.equal(sync.update([low,high],300,400,0.5),null);
    const hidden=structuredClone(high);
    for(const i of [11,13,15,23,25,27]) hidden[i].visibility=0;
    assert.equal(sync.update([hidden],300,400,0.6),null, 'must not switch to the other side');
    assert.equal(sync.update([low],0,400,0.7),null);
    const collapsed=high.map(p=>({...p,x:0.5,y:0.5}));
    assert.equal(sync.update([collapsed],300,400,0.8),null);
    sync.reset();
    assert.equal(sync.update([low],300,400,0)!.direction,'Holding');
    const wide=low.map(p=>({...p,x:p.x*0.5}));
    sync.reset(); const normal=sync.update([low],300,400,0)!;
    sync.reset(); const resized=sync.update([wide],600,400,0)!;
    assert.ok(Math.abs(normal.progress-resized.progress)<1e-8);
  }
});

test('body maps use exercise-specific targets and hide unavailable target areas', () => {
  let colors: string[]=[];
  const ctx = new Proxy({ strokeStyle: '', fillStyle: '' }, {
    get(target,key) { if(key in target) return target[key as keyof typeof target]; return () => { if(key==='stroke'||key==='fill') colors.push(key==='stroke'?target.strokeStyle:target.fillStyle); }; },
    set(target,key,value) { Reflect.set(target,key,value);return true; },
  }) as unknown as CanvasRenderingContext2D;
  for(const {id} of EXERCISES) {
    colors=[]; drawMappedBody(ctx,300,400,300,400,[referenceExercisePose(id,0.5)],id);
    assert.ok(colors.includes('#ed383e'),id);
    assert.equal(colors.includes('#f6c744'),id==='dumbbell_curl'||id==='lat_pulldown');
    colors=[]; drawMappedBody(ctx,300,400,300,400,[],id);
    assert.ok(!colors.includes('#ed383e'));
    const hidden=referenceExercisePose(id,0.5).map(p=>({...p,visibility:0}));
    colors=[]; drawMappedBody(ctx,300,400,300,400,[hidden],id);
    assert.ok(!colors.includes('#ed383e'));
  }
});
