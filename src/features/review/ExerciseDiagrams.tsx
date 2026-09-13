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

// Reuse the curl target map’s silhouette, colors and legend across the library.
export function MuscleDiagram({ focus }: { focus: MuscleId; compact?: boolean }) {
  if (focus === 'biceps') return <img className="reference-image" src="/target-muscles.svg" alt="Dumbbell curl target map: biceps and brachialis area in red, supporting forearms in yellow, other areas in gray." />;
  const rear = focus === 'lats' || focus === 'glutes';
  const label = focus === 'lats' ? 'Latissimus dorsi' : focus === 'glutes' ? 'Gluteus maximus' : 'Quadriceps';
  const location = focus === 'lats' ? 'Sides of the back' : focus === 'glutes' ? 'Back of the hips' : 'Front of the thighs';
  return <svg className="reference-image muscle-diagram" viewBox="0 0 600 440" role="img" aria-label={`${label} target map: red primary targets on a gray body, approximate ${rear ? 'back' : 'front'} view`}>
    <rect width="600" height="440" rx="18" fill="#101515" />
    <path d="M189 45 C167 45 165 82 178 94 L177 111 L147 124 Q134 131 129 151 L114 205 L94 248 L101 261 L119 247 L141 207 L153 175 L163 221 L158 257 L153 314 L160 373 L155 387 L178 387 L182 318 L190 270 L198 318 L202 387 L225 387 L220 373 L227 314 L222 257 L217 221 L227 175 L239 207 L261 247 L279 261 L286 248 L266 205 L251 151 Q246 131 233 124 L203 111 L202 94 C215 82 213 45 189 45Z" fill="#41494a" stroke="#95a09e" strokeWidth="2" strokeLinejoin="round" />
    <g fill="#ed383e" stroke="#101515" strokeWidth="3" strokeLinejoin="round">
      {focus === 'lats' && <><path d="M155 154 Q166 166 183 167 L184 225 Q169 220 162 205Z" /><path d="M225 154 Q214 166 197 167 L196 225 Q211 220 218 205Z" /></>}
      {focus === 'quadriceps' && <><path d="M161 259 Q174 251 184 268 L179 311 L175 328 Q166 335 158 321 L157 291Z" /><path d="M219 259 Q206 251 196 268 L201 311 L205 328 Q214 335 222 321 L223 291Z" /></>}
      {focus === 'glutes' && <><path d="M163 227 Q175 222 187 231 L187 263 Q174 281 158 266 L159 248Z" /><path d="M217 227 Q205 222 193 231 L193 263 Q206 281 222 266 L221 248Z" /></>}
    </g>
    <g fill="none" stroke="#101515" strokeWidth="3" strokeLinecap="round">
      {rear ? <><path d="M190 115V223M174 129l-14 13 15 16M206 129l14 13-15 16" /><path d="M190 234v29" /></> : <><path d="M159 143 Q174 132 188 146 V178 Q165 186 156 166 M221 143 Q206 132 192 146 V178 Q215 186 224 166 M190 186 V249 M168 226 L190 249 L212 226" /></>}
      <path d="M146 145l-13 45M234 145l13 45M161 341l7 27M219 341l-7 27" />
    </g>
    <g fontFamily="system-ui,sans-serif" fill="#d7dfda">
      <text x="32" y="30" fontSize="11" letterSpacing="2">TARGET MUSCLES</text>
      <text x="154" y="414" fontSize="11" fill="#9caea2">{rear ? 'BACK VIEW' : 'FRONT VIEW'}</text>
      <circle cx="327" cy="141" r="6" fill="#ed383e" /><text x="343" y="146" fontSize="15">Primary targets</text>
      <text x="343" y="172" fontSize="15">{label}</text><text x="343" y="194" fontSize="12" fill="#aebdb4">{location}</text>
      <circle cx="327" cy="265" r="6" fill="#606a6b" /><text x="343" y="270" fontSize="15">Other areas</text>
      <text x="319" y="371" fontSize="11" fill="#aebdb4">Exercise guide only.</text><text x="319" y="390" fontSize="11" fill="#aebdb4">Not measured activation.</text>
    </g>
  </svg>;
}
