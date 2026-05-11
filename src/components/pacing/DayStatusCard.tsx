import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatSubjectLabel } from '@/lib/academic-sanitize';

interface DayStatusCardProps {
  dayName: string;
  status: string;
  subjects: Record<string, string>;
}

/**
 * Read-only day card for pacing viewer / dashboard.
 * Renders CLT Testing days in Thales Pink (#c51062) per the CLT Protocol.
 * For the interactive editor variant, see DaySubjectCard.tsx.
 */
export const DayStatusCard: React.FC<DayStatusCardProps> = ({
  dayName,
  status,
  subjects,
}) => {
  const isCLT = status === 'CLT Testing';

  return (
    <Card
      className={cn(
        'p-4 transition-all duration-200',
        isCLT
          ? 'border-2 border-[#c51062] bg-[#c51062]/5 shadow-inner'
          : 'bg-card border',
      )}
    >
      <h3
        className={cn(
          'font-bold text-lg mb-2',
          isCLT ? 'text-[#c51062]' : 'text-foreground',
        )}
      >
        {dayName}
      </h3>

      {isCLT ? (
        <div className="flex flex-col items-center justify-center py-8 space-y-2">
          <div className="bg-[#c51062] text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-tighter">
            System Override
          </div>
          <p className="text-[#c51062] font-black text-2xl uppercase tracking-widest text-center">
            CLT Testing
          </p>
          <span className="text-sm font-medium text-[#c51062]/60 mt-1 italic">
            Non-Instructional Day
          </span>
        </div>
      ) : (
        <div className="space-y-2">
          {Object.entries(subjects).map(([subject, content]) => (
            <div
              key={subject}
              className="flex justify-between items-start text-sm border-b border-border/50 pb-1 last:border-0"
            >
              <span className="font-semibold text-muted-foreground mr-4">
                {formatSubjectLabel(subject)}:
              </span>
              <span className="text-right font-medium">{content || '---'}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
