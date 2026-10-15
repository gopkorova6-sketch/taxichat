// Live scrolling line for text that does not fit the width.
// Short text stays still; long text scrolls in a loop.
const Marquee = ({ text, className = "" }) => {
  const value = text ?? "";
  const long = value.length > 26;
  return (
    <div className={`overflow-hidden whitespace-nowrap ${className}`}>
      {long ? (
        <div className="inline-block animate-marquee">
          <span className="pr-10">{value}</span>
          <span className="pr-10" aria-hidden>{value}</span>
        </div>
      ) : (
        <span>{value}</span>
      )}
    </div>
  );
};

export default Marquee;
