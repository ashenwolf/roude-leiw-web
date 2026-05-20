type StatItemProps = {
  label: string;
  value: string | number;
};

const StatItem = ({ label, value }: StatItemProps) => (
  <div className="flex flex-col items-center">
    <span className="text-lg font-bold text-gray-800">{value}</span>
    <span className="text-xs text-gray-500">{label}</span>
  </div>
);

const formatMinutes = (minutes: number): string =>
  minutes < 1 ? "<1m" : `${Math.floor(minutes)}m`;

type StatsRowProps = {
  masteredWords: number;
  totalWords: number;
  accuracy: number;
  todayMinutes?: number;
};

export const StatsRow = ({ masteredWords, totalWords, accuracy, todayMinutes }: StatsRowProps) => (
  <div className="flex justify-around py-3 px-2 bg-white/60 rounded-xl">
    <StatItem label="Learned" value={`${masteredWords}/${totalWords}`} />
    <StatItem label="Accuracy" value={`${Math.round(accuracy * 100)}%`} />
    {todayMinutes !== undefined && (
      <StatItem label="Today" value={formatMinutes(todayMinutes)} />
    )}
  </div>
);
