import { useState } from 'react';

import { formatSatangAsBaht } from '../../main/calc/money';

export interface DonutSegment {
  readonly label: string;
  readonly valueMinor: number;
  readonly color: string;
}

interface CategoryDonutChartProps {
  readonly title: string;
  readonly segments: readonly DonutSegment[];
  readonly emptyMessage?: string;
}

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number,
): { x: number; y: number } {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeDonutArc(
  x: number,
  y: number,
  radius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  // If full circle (360 degrees)
  const angleDiff = endAngle - startAngle;
  const safeEndAngle = angleDiff >= 360 ? startAngle + 359.99 : endAngle;

  const start = polarToCartesian(x, y, radius, safeEndAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const innerStart = polarToCartesian(x, y, innerRadius, startAngle);
  const innerEnd = polarToCartesian(x, y, innerRadius, safeEndAngle);

  const largeArcFlag = safeEndAngle - startAngle <= 180 ? '0' : '1';

  return [
    'M',
    start.x,
    start.y,
    'A',
    radius,
    radius,
    0,
    largeArcFlag,
    0,
    end.x,
    end.y,
    'L',
    innerStart.x,
    innerStart.y,
    'A',
    innerRadius,
    innerRadius,
    0,
    largeArcFlag,
    1,
    innerEnd.x,
    innerEnd.y,
    'Z',
  ].join(' ');
}

export default function CategoryDonutChart({
  title,
  segments,
  emptyMessage = 'ยังไม่มีข้อมูล',
}: CategoryDonutChartProps): JSX.Element {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const total = segments.reduce((sum, s) => sum + s.valueMinor, 0);

  // Compute angles for each segment
  let currentAngle = 0;
  const arcs = segments
    .filter((s) => s.valueMinor > 0)
    .map((s, index) => {
      const angle = total > 0 ? (s.valueMinor / total) * 360 : 0;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle += angle;
      const percent = total > 0 ? Math.round((s.valueMinor / total) * 100) : 0;
      return {
        ...s,
        originalIndex: index,
        startAngle,
        endAngle,
        percent,
      };
    });

  const size = 180;
  const center = size / 2;
  const radius = 78;
  const innerRadius = 52;

  return (
    <div className="panel" style={{ flex: 1, minWidth: 280 }}>
      <div className="section-label" style={{ marginBottom: 12 }}>
        {title}
      </div>

      {total === 0 ? (
        <div className="empty-state" style={{ padding: '24px 10px' }}>
          <div className="icon">📊</div>
          <div className="muted">{emptyMessage}</div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 20,
          }}
        >
          {/* SVG Donut */}
          <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
            <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', height: '100%' }}>
              {arcs.map((arc) => {
                const isHovered = hoveredIndex === arc.originalIndex;
                const pathData = describeDonutArc(
                  center,
                  centerY(center),
                  isHovered ? radius + 4 : radius,
                  isHovered ? innerRadius - 2 : innerRadius,
                  arc.startAngle,
                  arc.endAngle,
                );
                return (
                  <path
                    key={arc.label}
                    d={pathData}
                    fill={arc.color}
                    opacity={hoveredIndex === null || isHovered ? 0.95 : 0.4}
                    style={{
                      cursor: 'pointer',
                      transition: 'opacity 0.15s ease, transform 0.15s ease',
                    }}
                    onMouseEnter={() => setHoveredIndex(arc.originalIndex)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  />
                );
              })}
            </svg>

            {/* Center Label */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                textAlign: 'center',
                padding: 10,
              }}
            >
              {hoveredIndex !== null && segments[hoveredIndex] ? (
                <>
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--ink-soft)',
                      fontWeight: 600,
                      maxWidth: 85,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {segments[hoveredIndex].label}
                  </div>
                  <div
                    className="num"
                    style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)' }}
                  >
                    {total > 0
                      ? `${Math.round((segments[hoveredIndex].valueMinor / total) * 100)}%`
                      : '0%'}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '10.5px', color: 'var(--ink-soft)' }}>รวมทั้งหมด</div>
                  <div
                    className="num"
                    style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)' }}
                  >
                    {formatSatangAsBaht(total).split('.')[0]} ฿
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Legend */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              flex: 1,
              minWidth: 150,
              fontSize: '12.5px',
            }}
          >
            {segments.map((seg, idx) => {
              const percent = total > 0 ? Math.round((seg.valueMinor / total) * 100) : 0;
              const isHovered = hoveredIndex === idx;
              return (
                <div
                  key={seg.label}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    cursor: 'pointer',
                    padding: '3px 6px',
                    borderRadius: 4,
                    background: isHovered ? 'var(--surface-2)' : 'transparent',
                    transition: 'background 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: seg.color,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: isHovered ? 600 : 400,
                      }}
                    >
                      {seg.label}
                    </span>
                  </div>
                  <div
                    className="num"
                    style={{
                      color: isHovered ? 'var(--ink)' : 'var(--ink-soft)',
                      textAlign: 'right',
                      flexShrink: 0,
                    }}
                  >
                    {formatSatangAsBaht(seg.valueMinor)} ({percent}%)
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function centerY(c: number): number {
  return c;
}
