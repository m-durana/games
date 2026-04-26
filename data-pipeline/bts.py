"""BTS T-100 fetcher.

Status: NOT WORKING in this environment.

The official T-100 Segment "All Carrier" download from
https://transtats.bts.gov/DL_SelectFields.aspx (and the PREZIP/T_T100_SEGMENT_ALL_CARRIER*.zip
URLs) requires a session established via JavaScript on the TranStats portal —
direct curl/requests calls are 302-redirected to ErrorPage.asp.

The BTS Socrata mirror (data.bts.gov / data.transportation.gov) only exposes the
T-100 Segment Summary roll-ups (bu82-4pwz, r495-tyji, q4tb-tbff, ...). None of
those preserve the (origin, destination, unique_carrier, passengers) tuple we
need to populate topAirlines / topDestinations.

If you need to revive this source, the minimum-viable path is:
  1. Use a real headless browser (playwright / selenium) to drive
     https://transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=FIM, select fields
     ORIGIN, DEST, UNIQUE_CARRIER, PASSENGERS for the desired year, click
     "Download", and pull the resulting zip.
  2. Alternative: Kaggle hosts a mirror — `kaggle datasets download
     -d gpreda/bts-domestic-airline-on-time-performance-data` style (requires
     KAGGLE_USERNAME / KAGGLE_KEY env vars).

For this run we fall through to Wikipedia for US airports/airlines.
"""
import json
import os
import sys

PIPE_DIR = os.path.dirname(os.path.abspath(__file__))


def main():
    out = {
        "version": "1.0",
        "source": "BTS T-100",
        "year": None,
        "airports": {},
        "airlines": {},
        "_status": "skipped: TranStats requires JS session; no granular OD+carrier mirror found",
    }
    path = os.path.join(PIPE_DIR, "bts_partial.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=2)
    print(f"BTS skipped, wrote stub: {path}", file=sys.stderr)


if __name__ == "__main__":
    main()
