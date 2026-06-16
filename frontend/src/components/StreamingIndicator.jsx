export default function StreamingIndicator() {
  return (
    <span
      className="inline-block w-2 h-5 bg-accent-500 animate-blink align-middle ml-0.5 rounded-sm"
      aria-label="Generating response"
    />
  );
}
