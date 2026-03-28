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

type StatsRowProps = {
  masteredWords: number;
  totalWords: number;
  accuracy: number;
  streak: number;
};

export const StatsRow = ({ masteredWords, totalWords, accuracy, streak }: StatsRowProps) => (
  <div className="flex justify-around py-3 px-2 bg-white/60 rounded-xl">
    <StatItem label="Learned" value={`${masteredWords}/${totalWords}`} />
    <StatItem label="Accuracy" value={`${Math.round(accuracy * 100)}%`} />
    <StatItem label="Streak" value={`${streak}d`} />
  </div>
);
