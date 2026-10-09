export default function Ring() {
  return (
    <div className="auth-ring" aria-hidden="true">
      <svg viewBox="0 0 400 400">
        <defs>
          <path
            id="auth-tp"
            d="M200,200 m-182,0 a182,182 0 1,1 364,0 a182,182 0 1,1 -364,0"
          />
        </defs>
        <g className="s5">
          <text>
            <textPath href="#auth-tp">
              BUY IT · SELL IT · BUILD IT · STUDY IT · BUY IT · SELL IT · BUILD IT · STUDY IT · BUY IT · SELL IT · BUILD IT · STUDY IT ·
            </textPath>
          </text>
        </g>
        <g className="s1">
          <circle
            cx="200"
            cy="200"
            r="152"
            fill="none"
            stroke="#FFC83D"
            strokeWidth="22"
            strokeDasharray="64 10 16 10"
          />
        </g>
        <g className="s2">
          <circle
            cx="200"
            cy="200"
            r="126"
            fill="none"
            stroke="#FF4A3D"
            strokeWidth="17"
            strokeDasharray="34 14 9 14"
          />
        </g>
        <g className="s3">
          <circle
            cx="200"
            cy="200"
            r="104"
            fill="none"
            stroke="#3D63FF"
            strokeWidth="15"
            strokeDasharray="22 8"
          />
        </g>
        <g className="s4">
          <circle
            cx="200"
            cy="200"
            r="84"
            fill="none"
            stroke="#5CF2C0"
            strokeWidth="10"
            strokeDasharray="10 7 3 7"
          />
        </g>
        <circle cx="200" cy="200" r="66" fill="#04050D" stroke="#F3F1EA" strokeWidth="3" opacity=".9" />
        <circle cx="200" cy="200" r="15" fill="#F3F1EA" />
        <circle cx="222" cy="222" r="5" fill="#3D63FF" />
      </svg>
    </div>
  );
}
