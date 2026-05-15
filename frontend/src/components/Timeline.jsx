export default function Timeline({ transactions }) {

  return (

    <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-zinc-800 mt-10 shadow-[0_0_25px_rgba(168,85,247,0.08)]">

      <h2 className="text-3xl font-bold mb-8 text-white">

        Investigation Timeline

      </h2>

      <div className="space-y-6 max-h-[600px] overflow-y-auto pr-4">

        {transactions.map((t, idx) => (

          <div
            key={idx}
            className="flex gap-6 items-start"
          >

            {/* TIMELINE DOT */}

            <div className="flex flex-col items-center">

              <div className="w-5 h-5 rounded-full bg-purple-500 mt-2" />

              {idx !== transactions.length - 1 && (

                <div className="w-[2px] h-24 bg-zinc-700" />

              )}

            </div>

            {/* CONTENT */}

            <div className="bg-black/40 rounded-xl p-5 w-full border border-zinc-800">

              <div className="flex justify-between items-center">

                <h3 className="text-lg font-bold text-purple-400">

                  {t.from_acc?.slice(0,8)}...

                  →

                  {t.to_acc?.slice(0,8)}...

                </h3>

                <span className="text-gray-400 text-sm">

                  {t.ts}

                </span>

              </div>

              <div className="mt-4 grid grid-cols-3 gap-4">

                {/* AMOUNT */}

                <div>

                  <p className="text-gray-400 text-sm">

                    Amount

                  </p>

                  <p className="text-xl font-bold text-red-400">

                    ${Number(t.amount).toLocaleString()}

                  </p>

                </div>

                {/* TYPE */}

                <div>

                  <p className="text-gray-400 text-sm">

                    Payment Format

                  </p>

                  <p className="text-lg text-white">

                    {t.fmt || "Unknown"}

                  </p>

                </div>

                {/* STATUS */}

                <div>

                  <p className="text-gray-400 text-sm">

                    Risk Status

                  </p>

                  <p className="text-lg text-orange-400">

                    {t.fraud ? "Fraud" : "Suspicious"}

                  </p>

                </div>

              </div>

            </div>

          </div>

        ))}

      </div>

    </div>
  );
}