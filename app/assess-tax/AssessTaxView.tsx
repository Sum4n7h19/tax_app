// @ts-nocheck
"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import "../globals.css";

export default function AssessTaxView() {
  const searchParams = useSearchParams();
  const propertyId = searchParams.get("propertyId");

  // Landuse + CornerSite from URL (raw strings)
  const landuseParam = (searchParams.get("landuse") || "").toString();
  const cornerParam = (searchParams.get("corner") || "").toString();

  // For display outside useEffect
  const landuseLowerDisplay = landuseParam.toLowerCase();
  const isVacantDisplay = landuseLowerDisplay === "vacant";

  const cornerLowerDisplay = cornerParam.toLowerCase();
  const isCornerDisplay =
    cornerLowerDisplay === "yes" ||
    cornerLowerDisplay === "y" ||
    cornerLowerDisplay === "1" ||
    cornerLowerDisplay === "true";

  useEffect(() => {
    const $ = (id: string) => document.getElementById(id) as any;

    const floorTbody = document.querySelector(
      "#floorTable tbody"
    ) as HTMLTableSectionElement | null;

    if (!floorTbody) return;

    // Re-compute flags *inside* effect
    const landuseLower = landuseParam.toLowerCase();
    const isVacantAttr = landuseLower === "vacant";

    const cornerLower = cornerParam.toLowerCase();
    const isCornerAttr =
      cornerLower === "yes" ||
      cornerLower === "y" ||
      cornerLower === "1" ||
      cornerLower === "true";

    // CornerSite checkbox (S3)
    const cornerInput = $("s3_isCorner") as HTMLInputElement | null;
    if (cornerInput) {
      cornerInput.checked = isCornerAttr;
      cornerInput.disabled = true;
    }

    // Vacant behaviour wiring
    const plotInput = $("s1_plotArea") as HTMLInputElement | null;
    const vacantInput = $("s5_vacantArea") as HTMLInputElement | null;
    const addFloorBtn = $("addFloorBtn") as HTMLButtonElement | null;
    const clearFloorsBtn = $("clearFloorsBtn") as HTMLButtonElement | null;

    const formatN = (n: any) => Number(n || 0).toFixed(2);

    // C1: Depreciation factor
    function computeDepFactor(year: number) {
      if (!year) return 0;
      const age = new Date().getFullYear() - parseInt(String(year), 10);

      if (age <= 5) return 0;
      if (age <= 10) return 0.05;
      if (age <= 20) return 0.1;
      if (age <= 30) return 0.2;
      return 0.3;
    }

    // Market value by construction type (S10)
    function marketByType(type: string) {
      const map: Record<string, number> = {
        RCC: Number($("s10_rcc").value) || 0,
        GRANITE: Number($("s10_granite").value) || 0,
        MOSAIC: Number($("s10_mosaic").value) || 0,
        OTHER: Number($("s10_other").value) || 0,
      };
      return map[type] || 0;
    }

    // Add a floor row (disabled for vacant sites)
    function addFloor(data?: any) {
      if (isVacantAttr) return; // no floors on vacant sites

      const idx = floorTbody.children.length + 1;
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${idx}</td>
        <td>
          <select class="s11_use">
            <option>Residential</option>
            <option>Commercial</option>
            <option>Industrial</option>
            <option>Public</option>
          </select>
        </td>
        <td><input class="s12_year" type="number" value="${data?.year || new Date().getFullYear()
        }"></td>
        <td><input class="c1_depr" type="number" readonly></td>
        <td>
          <select class="s13_type">
            <option value="RCC">RCC</option>
            <option value="GRANITE">GRANITE</option>
            <option value="MOSAIC">MOSAIC</option>
            <option value="OTHER">OTHER</option>
          </select>
        </td>
        <td><input class="c2_market" type="number"></td>
        <td><input class="c3_25" type="number" readonly></td>
        <td><input class="s14_bua" type="number" value="${data?.bua || 0}"></td>
        <td>
          <select class="s15_occ">
            <option value="0.5">Self-occupied (0.5)</option>
            <option value="1">Others (1)</option>
          </select>
        </td>
        <td><input class="c4_land" type="number" readonly></td>
        <td><input class="c5_build" type="number" readonly></td>
        <td><input class="c6_tax" type="number" readonly></td>
        <td><button class="delBtn btn">Del</button></td>
      `;

      if (data) {
        tr.querySelector(".s11_use").value = data.use || "Residential";
        tr.querySelector(".s12_year").value =
          data.year || new Date().getFullYear();
        tr.querySelector(".s13_type").value = data.ctype || "RCC";
        tr.querySelector(".c2_market").value =
          data.market || marketByType(tr.querySelector(".s13_type").value);
        tr.querySelector(".s14_bua").value = data.bua || 0;
        tr.querySelector(".s15_occ").value = data.occ || "0.5";
      } else {
        tr.querySelector(".c2_market").value = marketByType("RCC");
      }

      const allInputs = tr.querySelectorAll("input,select");
      allInputs.forEach((inp) =>
        inp.addEventListener("input", () => updateFloorRow(tr))
      );

      tr.querySelector(".s13_type").addEventListener("change", () => {
        tr.querySelector(".c2_market").value = marketByType(
          tr.querySelector(".s13_type").value
        );
        updateFloorRow(tr);
      });

      tr.querySelector(".delBtn").addEventListener("click", () => {
        tr.remove();
        refreshIndexes();
        computeAll();
      });

      floorTbody.appendChild(tr);
      updateFloorRow(tr);
    }

    function refreshIndexes() {
      Array.from(floorTbody.children).forEach(
        (tr: any, i: number) => (tr.cells[0].textContent = i + 1)
      );
    }

    // Update one floor row
    function updateFloorRow(tr: HTMLTableRowElement) {
      const year = Number(tr.querySelector(".s12_year").value) || 0;
      const dep = computeDepFactor(year);
      tr.querySelector(".c1_depr").value = formatN(dep);

      const c2 = Number(tr.querySelector(".c2_market").value) || 0;
      tr.querySelector(".c2_market").value = formatN(c2);

      const c3 = 0.25 * c2;
      tr.querySelector(".c3_25").value = formatN(c3);

      const bua = Number(tr.querySelector(".s14_bua").value) || 0;
      const occ = Number(tr.querySelector(".s15_occ").value) || 1;

      const plotArea = Number($("s1_plotArea").value) || 0;
      const validation = $("validation");
      if (!isVacantAttr && plotArea > 0 && bua > plotArea) {
        validation.innerHTML =
          '<span class="error">Built-up area in one floor exceeds total site area (ptax rule).</span>';
      }

      const GV = Number($("s2_GV").value) || 0;
      const isCorner = $("s3_isCorner").checked;
      const cornerAdd = isCorner ? 0.1 * GV : 0;
      const totalGuidance = GV + cornerAdd;
      const gv25 = 0.25 * totalGuidance;
      const plinth = Number($("s4_plinth").value) || 1;

      const c4 = bua * gv25 * occ * plinth;
      tr.querySelector(".c4_land").value = formatN(c4);

      const c5 = bua * c3 * occ * (1 - dep);
      tr.querySelector(".c5_build").value = formatN(c5);

      const rate = Number($("s6_taxRate").value) || 0;
      const c6 = (c4 + c5) * (rate / 100.0);
      tr.querySelector(".c6_tax").value = formatN(c6);

      computeAll();
    }

    // C7..C16 + debug panel
    function computeAll() {
      let totalBUA = 0;
      let sumC6 = 0;

      Array.from(floorTbody.children).forEach((trNode: any) => {
        const tr = trNode as HTMLTableRowElement;
        totalBUA += Number(tr.querySelector(".s14_bua").value) || 0;
        sumC6 += Number(tr.querySelector(".c6_tax").value) || 0;
      });

      $("c7_totalBUA").textContent = formatN(totalBUA);

      const GV = Number($("s2_GV").value) || 0;
      const isCorner = $("s3_isCorner").checked;
      const cornerAdd = isCorner ? 0.1 * GV : 0;          // Col 6
      const totalGuidance = GV + cornerAdd;               // Col 7

      $("c8_totalGuidance").textContent = formatN(totalGuidance);

      const GV25 = 0.25 * totalGuidance;                  // Col 8
      $("c9_gv25").textContent = formatN(GV25);

      const plot = Number($("s1_plotArea").value) || 0;
      const vacantAreaInput = Number($("s5_vacantArea").value) || 0;
      const rate = Number($("s6_taxRate").value) || 0;

      // Vacant-site logic:
      // effectiveVacantArea = full plot area when Landuse = Vacant
      // otherwise use S5
      const effectiveVacantArea = isVacantAttr ? plot : vacantAreaInput;

      // C10 – Vacant Land Tax = Area × 25% of Guidance × Tax Rate%
      const vacantTax = effectiveVacantArea * GV25 * (rate / 100.0);
      $("c10_vacantTax").textContent = formatN(vacantTax);

      // C11 – Sum of all floor-wise tax
      $("c11_sumFloorTax").textContent = formatN(sumC6);

      // Base Property Tax (Vacant + Floors)
      const propBefore = sumC6 + vacantTax;

      // C12 – Additional 29% tax (as per PDF)
      const additional29 = propBefore * 0.29;
      $("c12_additional29").textContent = formatN(additional29);

      // C13 – Total Property Tax = Base + 29%
      const totalTax = propBefore + additional29;
      $("c13_totalTax").textContent = formatN(totalTax);

      // C14 – Rebate (optional)
      const rebatePct = Number($("s7_rebate").value) || 0;
      const rebate = rebatePct / 100;
      const rebateAmt = totalTax * rebate;
      $("c14_rebate").textContent = formatN(rebateAmt);

      // C15 – Cess (optional)
      const cessPct = Number($("s8_cess").value) || 0;
      const cess = cessPct / 100;
      const cessAmt = totalTax * cess;
      $("c15_cess").textContent = formatN(cessAmt);

      // C16 – Final payable after rebate & cess
      const finalPayable = totalTax - rebateAmt + cessAmt;
      $("c16_totalPayable").textContent = formatN(finalPayable);

      const validation = $("validation");
      if (!isVacantAttr && plot > 0 && totalBUA > plot) {
        validation.innerHTML =
          '<span class="error">Total built-up area exceeds plot area.</span>';
      } else if (!validation.innerHTML) {
        validation.innerHTML = '<span class="ok">✔ OK</span>';
      }

      // 🔍 DEBUG PANEL
      const dbgGV = $("dbg_GV");
      const dbgCorner = $("dbg_cornerAdd");
      const dbgGV25 = $("dbg_GV25");
      const dbgRate = $("dbg_rate");
      const dbgRebatePct = $("dbg_rebatePct");
      const dbgRebateAmt = $("dbg_rebateAmt");
      const dbgCessPct = $("dbg_cessPct");
      const dbgCessAmt = $("dbg_cessAmt");
      const dbgVacantArea = $("dbg_vacantArea");
      const dbgVacantTax = $("dbg_vacantTax");
      const dbgTotalBUA = $("dbg_totalBUA");
      const dbgPlot = $("dbg_plotArea");
      const dbgFloorTax = $("dbg_totalFloorTax");
      const dbgTotalPayable = $("dbg_totalPayable");

      if (dbgGV) dbgGV.textContent = formatN(GV);
      if (dbgCorner) dbgCorner.textContent = formatN(cornerAdd);
      if (dbgGV25) dbgGV25.textContent = formatN(GV25);
      if (dbgRate) dbgRate.textContent = formatN(rate);
      if (dbgRebatePct) dbgRebatePct.textContent = formatN(rebatePct);
      if (dbgRebateAmt) dbgRebateAmt.textContent = formatN(rebateAmt);
      if (dbgCessPct) dbgCessPct.textContent = formatN(cessPct);
      if (dbgCessAmt) dbgCessAmt.textContent = formatN(cessAmt);
      if (dbgVacantArea) dbgVacantArea.textContent = formatN(effectiveVacantArea);
      if (dbgVacantTax) dbgVacantTax.textContent = formatN(vacantTax);
      if (dbgTotalBUA) dbgTotalBUA.textContent = formatN(totalBUA);
      if (dbgPlot) dbgPlot.textContent = formatN(plot);
      if (dbgFloorTax) dbgFloorTax.textContent = formatN(sumC6);
      if (dbgTotalPayable) dbgTotalPayable.textContent = formatN(finalPayable);
    }

    // Buttons
    $("addFloorBtn")?.addEventListener("click", () => addFloor());
    $("clearFloorsBtn")?.addEventListener("click", () => {
      floorTbody.innerHTML = "";
      computeAll();
    });

    $("computeBtn")?.addEventListener("click", () => {
      Array.from(floorTbody.children).forEach((tr) =>
        updateFloorRow(tr as HTMLTableRowElement)
      );
      computeAll();
    });

    $("exportBtn")?.addEventListener("click", () => {
      computeAll();
      window.print();
    });

    // Example A (demo)
    $("example1Btn")?.addEventListener("click", () => {
      $("s1_plotArea").value = 1200;
      $("s2_GV").value = 743.49;
      $("s4_plinth").value = 1;
      $("s5_vacantArea").value = isVacantAttr ? 1200 : 0;
      $("s6_taxRate").value = 0.4;
      $("s7_rebate").value = 5;
      $("s8_cess").value = 26;

      $("s10_rcc").value = 1576;
      $("s10_granite").value = 1421;
      $("s10_mosaic").value = 817.84;
      $("s10_other").value = 1000;

      floorTbody.innerHTML = "";

      if (!isVacantAttr) {
        addFloor({
          year: 2020,
          ctype: "RCC",
          market: 1576,
          bua: 500,
          occ: "0.5",
        });
      }

      computeAll();
    });

    // Example B (demo)
    $("example2Btn")?.addEventListener("click", () => {
      $("s1_plotArea").value = 2500;
      $("s2_GV").value = 900;
      $("s4_plinth").value = 1;
      $("s5_vacantArea").value = isVacantAttr ? 2500 : 1200;
      $("s6_taxRate").value = 0.8;
      $("s7_rebate").value = 0;
      $("s8_cess").value = 26;

      $("s10_rcc").value = 2000;
      $("s10_granite").value = 1800;
      $("s10_mosaic").value = 900;
      $("s10_other").value = 1100;

      floorTbody.innerHTML = "";

      if (!isVacantAttr) {
        addFloor({
          year: 2015,
          ctype: "GRANITE",
          market: 1800,
          bua: 800,
          occ: "1",
        });
        addFloor({
          year: 2000,
          ctype: "MOSAIC",
          market: 900,
          bua: 700,
          occ: "1",
        });
      }

      computeAll();
    });

    // Initial defaults
    if (isVacantAttr) {
      floorTbody.innerHTML = "";
      if (plotInput && vacantInput) {
        vacantInput.value = plotInput.value || "0";
        vacantInput.disabled = true;
        plotInput.addEventListener("input", () => {
          vacantInput.value = plotInput.value || "0";
          computeAll();
        });
      }
      if (addFloorBtn) addFloorBtn.disabled = true;
      if (clearFloorsBtn) clearFloorsBtn.disabled = true;
    } else {
      if (vacantInput) vacantInput.disabled = false;
      if (addFloorBtn) addFloorBtn.disabled = false;
      if (clearFloorsBtn) clearFloorsBtn.disabled = false;

      addFloor({
        year: new Date().getFullYear(),
        ctype: "RCC",
        market: marketByType("RCC"),
        bua: 500,
        occ: "0.5",
      });
    }

    computeAll();
  }, [landuseParam, cornerParam]);

  return (
    <div className="ptax-page">
      <div className="ptax-container">
        <h1>Property Tax Calculator</h1>

        {propertyId && (
          <h2 className="text-2xl font-bold text-center mb-2">
            Property ID: <strong>{propertyId}</strong>
          </h2>
        )}

        {landuseParam && (
          <h2 className="text-xl font-semibold mb-2 text-center">
            Landuse : <strong>{landuseParam}</strong>
          </h2>
        )}

        {/* INPUTS SECTION */}
        <div className="section">
          <h2 className="text-xl font-bold">Plot/Building Details</h2>

          <div className="grid2">
            <div>
              <div className="row">
                <span className="serial">S1</span>
                <label>Plot Area (sq ft)</label>
                <input id="s1_plotArea" type="number" defaultValue={1200} />
              </div>

              <div className="row">
                <span className="serial">S2</span>
                <label>Guidance Value Rs/sq ft</label>
                <input id="s2_GV" type="number" defaultValue={743.49} />
              </div>

              <div className="row">
                <span className="serial">S3</span>
                <label>Corner Plot?</label>
                <input id="s3_isCorner" type="checkbox" disabled />
              </div>

              <div className="row">
                <span className="serial">S4</span>
                <label>Plinth Factor</label>
                <input id="s4_plinth" type="number" defaultValue={1} />
              </div>

              <div className="row">
                <span className="serial">S5</span>
                <label>Vacant Area (sq ft)</label>
                <input id="s5_vacantArea" type="number" defaultValue={0} />
              </div>

              <div className="row">
                <span className="serial">S6</span>
                <label>Tax Rate %</label>
                <input id="s6_taxRate" type="number" defaultValue={0.4} />
              </div>

              <div className="row">
                <span className="serial">S7</span>
                <label>Rebate %</label>
                <input id="s7_rebate" type="number" defaultValue={5} />
              </div>

              <div className="row">
                <span className="serial">S8</span>
                <label>Cess %</label>
                <input id="s8_cess" type="number" defaultValue={26} />
              </div>
            </div>

            <div>
              <p className="text-large font-bold">Market value table (Rs/sq ft)</p>

              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Market Rs/sq ft</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>RCC</td>
                    <td><input id="s10_rcc" defaultValue={1576} /></td>
                  </tr>
                  <tr>
                    <td>Granite</td>
                    <td><input id="s10_granite" defaultValue={1421} /></td>
                  </tr>
                  <tr>
                    <td>Mosaic</td>
                    <td><input id="s10_mosaic" defaultValue={817.84} /></td>
                  </tr>
                  <tr>
                    <td>Other</td>
                    <td><input id="s10_other" defaultValue={1000} /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* FLOOR SECTION */}
        <div className={`section ${isVacantDisplay ? "section-disabled" : ""}`}>
          <h2>Floor Details (each row = one floor)</h2>

          <div className="row">
            <button id="addFloorBtn" className="btn primary">Add Floor</button>
            <button id="clearFloorsBtn" className="btn">Clear</button>
            <span style={{ marginLeft: "auto" }} className="small">
              Self-occupied = 0.5, Others = 1.0
            </span>
          </div>

          <p className="small" style={{ color: isVacantDisplay ? "#888" : "#000" }}>
            {isVacantDisplay
              ? "Landuse is Vacant: floor details are disabled and entire plot is treated as vacant land."
              : "Enter floor-wise built up areas and usage."}
          </p>

          <table id="floorTable">
            <thead>
              <tr>
                <th>#</th>
                <th>S11 Use</th>
                <th>S12 Year</th>
                <th>C1 Dep</th>
                <th>S13 Type</th>
                <th>C2 Market</th>
                <th>C3 25%</th>
                <th>S14 BUA</th>
                <th>S15 Occ</th>
                <th>C4 Land</th>
                <th>C5 Build</th>
                <th>C6 Tax</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>

        {/* COMPUTED SECTION */}
        <div className="section">
          <h2 className="text-xl font-bold">Computed Results</h2>

          <div className="grid2">
            <div className="computed">
              <div><span className="serial">C7</span>Total BUA: <span id="c7_totalBUA">0.00</span></div>
              <div><span className="serial">C8</span>Total Guidance: <span id="c8_totalGuidance">0.00</span></div>
              <div><span className="serial">C9</span>GV25: <span id="c9_gv25">0.00</span></div>
              <div><span className="serial">C10</span>Vacant Tax: <span id="c10_vacantTax">0.00</span></div>
            </div>

            <div className="computed">
              <div><span className="serial">C11</span>Sum Floor Tax: <span id="c11_sumFloorTax">0.00</span></div>
              <div><span className="serial">C12</span>Additional 29% Tax: <span id="c12_additional29">0.00</span></div>
              <div><span className="serial">C13</span>Total Property Tax (Base + 29%): <span id="c13_totalTax">0.00</span></div>
              <div><span className="serial">C14</span>Rebate Amount: <span id="c14_rebate">0.00</span></div>
              <div><span className="serial">C15</span>Cess Amount: <span id="c15_cess">0.00</span></div>
              <div><span className="serial">C16</span>Total Payable: <span id="c16_totalPayable">0.00</span></div>
            </div>
          </div>

          <div className="row">
            <button id="computeBtn" className="btn primary">Compute All</button>
            <button id="example1Btn" className="btn">Example A</button>
            <button id="example2Btn" className="btn">Example B</button>
            <button id="exportBtn" className="btn">Export (Print / PDF)</button>
          </div>

          <div id="validation" className="small"></div>
        </div>

        {/* 🔍 DEBUG PANEL */}
        <div className="section debug-panel">
          <h2>Debug Panel (Internal Values)</h2>
          <p className="small">
            Use this to compare with the official ptax calculator. All values are post-calculation.
          </p>
          <table>
            <tbody>
              <tr>
                <td>Plot Area (S1)</td>
                <td><span id="dbg_plotArea">0.00</span></td>
              </tr>
              <tr>
                <td>Total BUA (C7)</td>
                <td><span id="dbg_totalBUA">0.00</span></td>
              </tr>
              <tr>
                <td>Guidance Value GV (S2)</td>
                <td><span id="dbg_GV">0.00</span></td>
              </tr>
              <tr>
                <td>Corner Add</td>
                <td><span id="dbg_cornerAdd">0.00</span></td>
              </tr>
              <tr>
                <td>GV25 (25% of Guidance)</td>
                <td><span id="dbg_GV25">0.00</span></td>
              </tr>
              <tr>
                <td>Tax Rate % (S6)</td>
                <td><span id="dbg_rate">0.00</span></td>
              </tr>
              <tr>
                <td>Vacant Area used</td>
                <td><span id="dbg_vacantArea">0.00</span></td>
              </tr>
              <tr>
                <td>Vacant Land Tax (C10)</td>
                <td><span id="dbg_vacantTax">0.00</span></td>
              </tr>
              <tr>
                <td>Sum Floor Tax (C11)</td>
                <td><span id="dbg_totalFloorTax">0.00</span></td>
              </tr>
              <tr>
                <td>Rebate % (S7)</td>
                <td><span id="dbg_rebatePct">0.00</span></td>
              </tr>
              <tr>
                <td>Rebate Amount (C14)</td>
                <td><span id="dbg_rebateAmt">0.00</span></td>
              </tr>
              <tr>
                <td>Cess % (S8)</td>
                <td><span id="dbg_cessPct">0.00</span></td>
              </tr>
              <tr>
                <td>Cess Amount (C15)</td>
                <td><span id="dbg_cessAmt">0.00</span></td>
              </tr>
              <tr>
                <td>Total Payable (C16)</td>
                <td><span id="dbg_totalPayable">0.00</span></td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
