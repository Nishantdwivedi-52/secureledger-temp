import { useEffect, useState } from "react";

import axios from "axios";

import Timeline from "../components/Timeline";

import RingGraph from "../components/RingGraph";

export default function Investigator() {

  const [stats, setStats] = useState({

    total_rings: 0,

    masterminds: 0,

    suspicious_accounts: 0
  });

  const [masterminds, setMasterminds] = useState([]);

  // --------------------------------------
  // TIMELINE STATE
  // --------------------------------------

  const [timelineData, setTimelineData] = useState([]);

  // --------------------------------------
  // DOWNLOAD STR REPORT
  // --------------------------------------

  const downloadReport = async (ringId) => {

    try {

      const response = await fetch(

        `http://127.0.0.1:8000/api/report/${ringId}`
      );

      const text = await response.text();

      const blob = new Blob(

        [text],

        { type: "text/plain" }
      );

      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");

      a.href = url;

      a.download = `${ringId}_STR_Report.txt`;

      document.body.appendChild(a);

      a.click();

      a.remove();

    } catch (err) {

      console.error(err);

    }
  };

  // --------------------------------------
  // LOAD REAL TIMELINE
  // --------------------------------------

  const loadTimeline = async (ringId) => {

    try {

      const response = await fetch(

        `http://127.0.0.1:8000/api/timeline/${ringId}`
      );

      const data = await response.json();

      setTimelineData(data);

    } catch (err) {

      console.error(err);

    }
  };

  // --------------------------------------
  // LOAD DASHBOARD DATA
  // --------------------------------------

  useEffect(() => {

    // ----------------------------------
    // LOAD STATS
    // ----------------------------------

    axios

      .get(
        "http://127.0.0.1:8000/api/rings/stats"
      )

      .then((res) => {

        setStats(res.data);

      })

      .catch((err) => {

        console.error(err);

      });

    // ----------------------------------
    // LOAD MASTERMINDS
    // ----------------------------------

    axios

      .get(
        "http://127.0.0.1:8000/api/masterminds"
      )

      .then((res) => {

        setMasterminds(res.data);

      })

      .catch((err) => {

        console.error(err);

      });

  }, []);

  // --------------------------------------
  // UI
  // --------------------------------------

  return (

    <div className="min-h-screen text-white p-6 bg-gradient-to-br from-black via-[#050816] to-[#0B1120]">

      {/* HEADER */}

      <div className="mb-12">

        <h1 className="text-6xl font-extrabold bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 bg-clip-text text-transparent">

          SecureLedger AI

        </h1>

        <p className="text-gray-400 mt-4 text-xl">

          Enterprise Fraud Intelligence Dashboard

        </p>

      </div>

      {/* STATS */}

      <div className="grid grid-cols-3 gap-6 mb-10">

        {/* RINGS */}

        <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-zinc-800 shadow-[0_0_25px_rgba(168,85,247,0.08)]">

          <h2 className="text-gray-400 text-lg">

            Fraud Rings

          </h2>

          <p className="text-5xl font-bold mt-4 text-red-400">

            {stats.total_rings}

          </p>

        </div>

        {/* MASTERMINDS */}

        <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-zinc-800 shadow-[0_0_25px_rgba(168,85,247,0.08)]">

          <h2 className="text-gray-400 text-lg">

            Masterminds

          </h2>

          <p className="text-5xl font-bold mt-4 text-purple-400">

            {stats.masterminds}

          </p>

        </div>

        {/* ACCOUNTS */}

        <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-zinc-800 shadow-[0_0_25px_rgba(168,85,247,0.08)]">

          <h2 className="text-gray-400 text-lg">

            Suspicious Accounts

          </h2>

          <p className="text-5xl font-bold mt-4 text-orange-400">

            {stats.suspicious_accounts}

          </p>

        </div>

      </div>

      {/* MASTERMINDS TABLE */}

      <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-zinc-800 mb-10 shadow-[0_0_25px_rgba(168,85,247,0.08)]">

        <h2 className="text-3xl font-bold mb-6">

          Top Masterminds

        </h2>

        <table className="w-full">

          <thead>

            <tr className="border-b border-zinc-700 text-left">

              <th className="pb-4">

                Account

              </th>

              <th className="pb-4">

                Ring

              </th>

              <th className="pb-4">

                Mastermind Score

              </th>

              <th className="pb-4">

                Fraud Probability

              </th>

              <th className="pb-4">

                Actions

              </th>

            </tr>

          </thead>

          <tbody>

            {masterminds.map((m, idx) => (

              <tr
                key={idx}
                className="border-b border-zinc-800 hover:bg-white/10 transition duration-300"
              >

                {/* ACCOUNT */}

                <td className="py-4">

                  {m.id.slice(0,12)}...

                </td>

                {/* RING */}

                <td className="py-4 text-purple-400">

                  {m.ring_id}

                </td>

                {/* SCORE */}

                <td className="py-4">

                  {m.mastermind_score.toFixed(2)}

                </td>

                {/* FRAUD */}

                <td className="py-4 text-red-400">

                  {(m.fraud_prob * 100).toFixed(1)}%

                </td>

                {/* ACTIONS */}

                <td className="py-4 flex gap-2">

                  {/* DOWNLOAD */}

                  <button

                    onClick={() =>
                      downloadReport(m.ring_id)
                    }

                    className="bg-gradient-to-r from-purple-500 to-pink-500 hover:scale-105 px-4 py-2 rounded-xl transition"
                  >

                    Download STR

                  </button>

                  {/* TIMELINE */}

                  <button

                    onClick={() =>
                      loadTimeline(m.ring_id)
                    }

                    className="bg-gradient-to-r from-red-500 to-orange-500 hover:scale-105 px-4 py-2 rounded-xl transition"
                  >

                    View Timeline

                  </button>

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

      {/* GRAPH */}

      <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-purple-500/20 shadow-[0_0_40px_rgba(168,85,247,0.15)]">

        <h2 className="text-3xl font-bold mb-4">

          Fraud Ring Network

        </h2>

        <RingGraph />

      </div>

      {/* TIMELINE */}

      {timelineData.length > 0 && (

        <Timeline
          transactions={timelineData}
        />

      )}

    </div>
  );
}