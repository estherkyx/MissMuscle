import type { ExerciseId, MuscleId } from './exercise-library';

// Original schematic SVGs, not reconstructed body poses or measured activation.
const ink = '#35543f';
const skin = '#d8c7a4';
function Head({ x, y }: { x: number; y: number }) { return <circle cx={x} cy={y} r="13" fill={skin} stroke={ink} strokeWidth="2" />; }
function Dumbbell({ x, y }: { x: number; y: number }) { return <g stroke={ink} strokeWidth="5" strokeLinecap="round"><path d={`M${x} ${y-12}v24M${x-8} ${y-11}h16M${x-8} ${y+11}h16`} /></g>; }

export function FormDiagram({ exercise }: { exercise: ExerciseId }) {
  if (exercise === 'dumbbell_curl') return <img className="reference-image" src="/curl-reference.svg" alt="Curl schematic: bend at the elbow with a steady upper arm, then lower with control." />;
  return <svg className="reference-image form-diagram" viewBox="0 0 460 240" role="img" aria-label={`${exercise.replaceAll('_', ' ')}: schematic start and finish positions`}>
    <rect width="460" height="240" rx="14" fill="#e1e7d5" />
    <text x="230" y="21" textAnchor="middle" className="diagram-caption">MOVEMENT REFERENCE · SCHEMATIC</text>
    {exercise === 'lat_pulldown' && <>
      {[115, 345].map((x, i) => <g key={x}>
        <path d={`M${x-67} 200V36h134v164M${x} 36v${i ? 75 : 13}`} fill="none" stroke="#a5b698" strokeWidth="3" />
        <path d={`M${x-28} 157h56M${x} 160v37M${x-40} 200h80`} stroke="#82976c" strokeWidth="6" strokeLinecap="round" />
        <Head x={x} y={83} />
        <path d={`M${x} 99v48m-2 0-24 21-5 28m33-49 24 21 5 28`} fill="none" stroke={ink} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        <path d={i ? `M${x-4} 103l-29 28-16-22M${x+4} 103l29 28 16-22` : `M${x-4} 103l-29-23-16-30M${x+4} 103l29-23 16-30`} fill="none" stroke={ink} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <path d={`M${x-55} ${i ? 109 : 49}h110`} stroke={ink} strokeWidth="5" strokeLinecap="round" />
        <path d={`M${x-25} 149h50`} stroke="#b58b58" strokeWidth="7" strokeLinecap="round" />
        <text x={x} y="222" textAnchor="middle" className="diagram-label">{i ? 'Elbows down · bar in front' : 'Reach up with control'}</text>
      </g>)}
    </>}
    {exercise === 'leg_extension' && <>
      {[65, 285].map((x, i) => <g key={x}>
        <path d={`M${x-9} 83v70h78M${x} 155v47m56-47v47`} stroke="#8a9d79" strokeWidth="7" fill="none" strokeLinecap="round" />
        <Head x={x+13} y={61} />
        <path d={`M${x+13} 78v59h58${i ? 'l57-4 12-6' : 'v55l12 2'}`} fill="none" stroke={ink} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        <path d={`M${x+16} 92l21 32-3 23`} fill="none" stroke={ink} strokeWidth="7" strokeLinecap="round" />
        <circle cx={x+71} cy="137" r="5" fill="#bc8050" />
        <path d={i ? `M${x+119} 140l13-1` : `M${x+66} 181h13`} stroke="#b58b58" strokeWidth="13" strokeLinecap="round" />
        <text x={x+43} y="222" textAnchor="middle" className="diagram-label">{i ? 'Extend · lower smoothly' : 'Knee aligned with pivot'}</text>
      </g>)}
    </>}
    {exercise === 'dumbbell_front_squat' && <>
      <path d="M65 204h90m140 0h90" stroke="#a5b698" strokeWidth="2" />
      <Head x={105} y={52} /><Head x={322} y={87} />
      <g fill="none" stroke={ink} strokeLinecap="round" strokeLinejoin="round">
        <path d="M105 70v58m-3 0-12 38-5 34m23-72 12 38 5 34M323 105l-13 43 48 11-10 41m-37-51 22 24-7 27" strokeWidth="10" />
        <path d="M101 80l-17 29-7-29m33 0 17 29 7-29M320 112l-18 28-7-26m33-2 17 28 8-28" strokeWidth="7" />
      </g>
      <Dumbbell x={77} y={76} /><Dumbbell x={134} y={76} /><Dumbbell x={295} y={109} /><Dumbbell x={353} y={109} />
      <text x="105" y="224" textAnchor="middle" className="diagram-label">Weights at shoulders</text><text x="335" y="224" textAnchor="middle" className="diagram-label">Lower · stand with control</text>
    </>}
    <path d="M219 113h20m-6-5 6 5-6 5" fill="none" stroke="#7f9b56" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}

export function MuscleDiagram({ focus, compact = false }: { focus: MuscleId; compact?: boolean }) {
  if (focus === 'biceps') return <img className="reference-image" src="/target-muscles.svg" alt="Upper-arm schematic: biceps brachii at the front, with brachialis underneath." />;
  const rear = focus === 'lats' || focus === 'glutes';
  const label = focus === 'lats' ? 'Latissimus dorsi' : focus === 'glutes' ? 'Gluteus maximus' : 'Quadriceps';
  return <svg className="reference-image muscle-diagram" viewBox={compact ? '65 10 145 205' : '0 0 460 240'} role="img" aria-label={`${label} highlighted in an approximate ${rear ? 'back' : 'front'} view`}>
    <rect width="460" height="240" rx="14" fill="#e1e7d5" />
    <text x="135" y="21" textAnchor="middle" className="diagram-caption">{rear ? 'BACK VIEW' : 'FRONT VIEW'}</text>
    <Head x={135} y={43} />
    <path d="M124 57h22l28 12 17 61-10 4-22-47-7 37 8 24-9 56h-13l-3-52-3 52h-13l-9-56 8-24-7-37-22 47-10-4 17-61z" fill={skin} stroke={ink} strokeWidth="2" strokeLinejoin="round" />
    {focus === 'lats' && <g fill="#88a157"><path d="M111 78l21 6v44l-13-9z" /><path d="M159 78l-21 6v44l13-9z" /></g>}
    {focus === 'quadriceps' && <g fill="#88a157"><path d="M114 143q11-7 16 2l-3 38q-5 7-9-1z" /><path d="M140 145q8-9 16-2l-3 39q-5 7-9 1z" /></g>}
    {focus === 'glutes' && <g fill="#88a157"><path d="M115 127q10-4 18 0v22q-13 8-20-4z" /><path d="M137 127q9-4 18 0l2 18q-8 12-20 4z" /></g>}
    <path d={`M${focus === 'lats' ? 154 : 153} ${focus === 'lats' ? 98 : focus === 'glutes' ? 140 : 163}H235`} stroke="#678247" strokeWidth="1.5" />
    <text x="250" y={focus === 'lats' ? 95 : focus === 'glutes' ? 137 : 160} className="diagram-muscle-label">{label}</text>
    <text x="250" y={focus === 'lats' ? 113 : focus === 'glutes' ? 155 : 178} className="diagram-label">{focus === 'lats' ? 'Sides of the mid / lower back' : focus === 'glutes' ? 'Back of the hips' : 'Front of the thigh'}</text>
    <text x="230" y="228" textAnchor="middle" className="diagram-caption">APPROXIMATE ANATOMY · NOT MEASURED ACTIVATION</text>
  </svg>;
}
