import type { ExerciseId, MuscleId } from './exercise-library';

// Authored AI illustrations follow the catalogue's variations, not measured poses.
const movementReferences: Record<ExerciseId, { src: string; alt: string; steps: [string, string] }> = {
  dumbbell_curl: {
    src: '/exercise-references/dumbbell-curl.webp',
    alt: 'Illustrated trainer standing with palms-up dumbbells beside her thighs, then curling both weights toward her shoulders with upper arms beside her torso.',
    steps: ['Arms extended · palms forward', 'Curl · keep upper arms steady'],
  },
  lat_pulldown: {
    src: '/exercise-references/lat-pulldown.webp',
    alt: 'Matching front views of an illustrated trainer seated with thighs secured and feet grounded, first holding a wide bar overhead, then pulling it in front toward her upper chest while keeping the same head, torso, and leg orientation.',
    steps: ['Reach overhead · overhand grip', 'Pull toward upper chest'],
  },
  leg_extension: {
    src: '/exercise-references/leg-extension.webp',
    alt: 'Side view of an illustrated trainer on a leg-extension machine with back and thighs supported, first with knees bent, then legs extended forward and the roller above her ankles.',
    steps: ['Set up · roller above ankles', 'Extend · return with control'],
  },
  dumbbell_front_squat: {
    src: '/exercise-references/dumbbell-front-squat.webp',
    alt: 'Illustrated trainer holding two dumbbells at her shoulders, first standing, then lowering into a squat with thighs around parallel and feet grounded.',
    steps: ['Stand · weights at shoulders', 'Lower · keep feet grounded'],
  },
};

export function FormDiagram({ exercise }: { exercise: ExerciseId }) {
  const reference = movementReferences[exercise];
  return <figure className="movement-reference">
    <div className="movement-reference-heading"><span>MOVEMENT REFERENCE</span><span>AI illustration</span></div>
    <img src={reference.src} alt={reference.alt} width="1536" height="1024" decoding="async" />
    <figcaption className="movement-reference-steps">
      {reference.steps.map((step, index) => <span key={step}><b>{index + 1}</b>{step}</span>)}
    </figcaption>
  </figure>;
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
