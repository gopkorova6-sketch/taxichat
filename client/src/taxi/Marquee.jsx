// Live scrolling line for text that does not fit the width.
// Fits -> static. Too long -> the text scrolls in a loop inside a clipped box.
const Marquee = ({ text, className = "" }) => {
  const value = text ?? "";
  const long = value.length > 22;
  return (
    <div className={`min-w-0 overflow-hidden ${className}`}>
      {long ? (
        <div className="flex w-max animate-marquee whitespace-nowrap">
          <span className="pr-12">{value}</span>
          <span className="pr-12" aria-hidden>{value}</span>
        </div>
      ) : (
        <span className="block truncate">{value}</span>
      )}
    </div>
  );
};

export default Marquee;
