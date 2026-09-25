/* Same checks as SimulationCheck (Main.java + JackpotConfig.java).
   Labels, rounding and the strict interval tests are kept as they are. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SimCheck = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var KNOWN = {
    "Number of plays": 1, "Wager amount": 1, "Total wager": 1, "Base game prize total": 1,
    "Total JP contributions awarded": 1, "Total Seeds awarded": 1, "Total JP awarded": 1,
    "Total JP contributions available": 1, "Initial amount": 1, "Seed": 1, "Reserve Seed": 1,
    "Deficit": 1, "Overflow": 1, "Total JP available": 1, "Total contribution awarded + available": 1,
    "Total JP awarded + available": 1, "Increment value": 1, "Seed increment value": 1,
    "Reserve seed increment value": 1, "Num wins": 1, "Largest Single Jackpot": 1,
    "Smallest Single Jackpot": 1, "Wins": 1, "Multipliers": 1
  };
  var NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;

  function round(value, decimalPlaces) {
    var scaleFactor = Math.pow(10, decimalPlaces);
    return Math.round(value * scaleFactor) / scaleFactor;
  }

  function fmt(n) {
    if (!isFinite(n)) return String(n);
    var text = String(round(n, 10));
    return text === "-0" ? "0" : text;
  }

  function tryParseNumber(token) {
    var text = String(token).trim();
    var match = NUMBER.exec(text);
    if (!match || match.index !== 0) return null;
    var rest = text.slice(match[0].length).trim();
    if (rest && !(rest.charAt(0) === "(" && rest.charAt(rest.length - 1) === ")")) return null;
    return parseFloat(match[0]);
  }

  function splitValues(rest) {
    var values = [];
    if (!rest || !String(rest).trim()) return values;
    String(rest).split(",").forEach(function (part) {
      var token = part.trim();
      if (token) values.push(token);
    });
    return values;
  }

  function oneNumber(rest, key, where) {
    var values = splitValues(rest);
    if (values.length !== 1) throw new Error(where + ": " + key + " should be one number");
    var number = tryParseNumber(values[0]);
    if (number === null) throw new Error(where + ": could not read " + key + " from " + values[0]);
    return number;
  }

  function parseDump(text) {
    var lines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/);
    var sections = [];
    var current = null;
    for (var lineNo = 0; lineNo < lines.length; lineNo++) {
      var line = lines[lineNo].trim();
      if (!line) continue;
      var comma = line.indexOf(",");
      var key = comma < 0 ? line : line.slice(0, comma).trim();
      var rest = comma < 0 ? "" : line.slice(comma + 1);
      if (key.indexOf("Tier") === 0 || key === "Multipliers") continue;
      var where = "line " + (lineNo + 1);
      if (key === "Number of plays") {
        current = { name: null, fields: {}, wins: null };
        sections.push(current);
        current.fields[key] = oneNumber(rest, key, where);
        continue;
      }
      var values = splitValues(rest);
      if (!KNOWN[key] && values.length === 0) {
        current = { name: key, fields: {}, wins: null };
        sections.push(current);
        continue;
      }
      if (!current) throw new Error(where + ": data starts before Number of plays");
      if (key === "Wins") {
        current.wins = values.map(function (token) {
          var win = tryParseNumber(token);
          if (win === null) throw new Error(where + ": could not read a win from " + token);
          return win;
        });
        continue;
      }
      if (values.length === 1) {
        var number = tryParseNumber(values[0]);
        if (number === null) continue;
        if (Object.prototype.hasOwnProperty.call(current.fields, key)) throw new Error(where + ": duplicate " + key);
        current.fields[key] = number;
      }
    }

    var wagers = [];
    var wager = null;
    sections.forEach(function (section) {
      if (section.name === null) {
        wager = { header: section, jps: [] };
        wagers.push(wager);
      } else {
        if (!wager) throw new Error("Jackpot " + section.name + " appears before Number of plays");
        wager.jps.push(section);
      }
    });
    if (!wagers.length) throw new Error("no wager blocks");
    var names = wagers[0].jps.map(function (jp) { return jp.name; });
    if (!names.length) throw new Error("first wager has no jackpot");
    wagers.forEach(function (block) {
      var got = block.jps.map(function (jp) { return jp.name; }).join("\0");
      if (got !== names.join("\0")) {
        throw new Error("Jackpot list changed at wager " + requireField(block.header, "Wager amount"));
      }
    });
    return { names: names, wagers: wagers };
  }

  function requireField(section, key) {
    if (!Object.prototype.hasOwnProperty.call(section.fields, key)) {
      throw new Error((section.name === null ? "wager header" : section.name) + ": missing " + key);
    }
    return section.fields[key];
  }

  function seedBalance(section, state) {
    var hasSeed = Object.prototype.hasOwnProperty.call(section.fields, "Seed");
    var hasInitial = Object.prototype.hasOwnProperty.call(section.fields, "Initial amount");
    var seed = hasSeed ? section.fields.Seed : 0;
    var field, value;
    if (hasSeed && !(seed === 0 && hasInitial)) {
      field = "Seed";
      value = seed;
    } else if (hasInitial) {
      field = "Initial amount";
      value = section.fields["Initial amount"];
    } else {
      throw new Error((section.name === null ? "wager header" : section.name) + ": missing Seed / Initial amount");
    }
    if (!state.seedField) state.seedField = field;
    else if (state.seedField !== field) throw new Error("Mixed seed fields in one file: " + state.seedField + " and " + field);
    return value;
  }

  function buildConfig(input) {
    var oddsUp = input.oddsUp, seeds = input.seeds, targets = input.targets;
    if (!oddsUp.length || oddsUp.length !== seeds.length || oddsUp.length !== targets.length) {
      throw new Error("Odds Up, Seed Value and Triggered Target must list the same number of jackpots");
    }
    if (!(input.oddsDown > 0)) throw new Error("Odds Down must be positive");
    var oddsUpSum = oddsUp.reduce(function (a, b) { return a + b; }, 0);
    if (!(oddsUpSum > 0)) throw new Error("Odds Up must sum to a positive number");
    var totalCost = 0;
    var costs = oddsUp.map(function (up, i) {
      var cost = (targets[i] - seeds[i]) * up;
      totalCost += cost;
      return cost;
    });
    if (totalCost === 0) throw new Error("Triggered Target and Seed leave no contribution to split");
    var avg = 0;
    var contriSplit = costs.map(function (cost, i) {
      avg += targets[i] * oddsUp[i] / oddsUpSum;
      return round(input.contributionRtp * cost / totalCost, 6);
    });
    return {
      defaultRTP: input.mainRtp,
      defaultStdDev: input.stdDev,
      seedRTP: input.seedRtp,
      contributionRtp: input.contributionRtp,
      oddsDown: input.oddsDown,
      oddsUp: oddsUp,
      seeds: seeds,
      targets: targets,
      numOfJPs: oddsUp.length,
      oddsUpSum: oddsUpSum,
      avgJPSize: avg,
      contriSplit: contriSplit
    };
  }

  function Tally() {
    this.checks = 0;
    this.pass = 0;
    this.fail = 0;
  }
  Tally.prototype.mark = function (pass) {
    this.checks++;
    if (pass) this.pass++;
    else this.fail++;
    return pass ? "---PASS---" : "***FAIL***";
  };

  function emit(lines, tally, pass, text, a, b) {
    lines.push(text + tally.mark(pass));
    if (!pass && arguments.length > 4) {
      lines.push(String(a));
      lines.push(String(b));
    }
  }

  function run(text, input) {
    var parsed = parseDump(text);
    var config = buildConfig(input);
    if (parsed.names.length !== config.numOfJPs) {
      throw new Error("File has " + parsed.names.length + " jackpot(s) (" + parsed.names.join(", ") + ") but " + config.numOfJPs + " parameter value(s) were entered");
    }
    var state = { seedField: "" };
    parsed.wagers.forEach(function (block) {
      seedBalance(block.header, state);
      block.jps.forEach(function (jp) { seedBalance(jp, state); });
    });
    var lines = [];
    var tally = new Tally();
    var wagerResults = [];
    lines.push("Seed balance field:\t" + state.seedField);
    lines.push("Jackpots:\t" + parsed.names.map(function (name, i) { return "JP" + i + " " + name; }).join(", "));
    lines.push("");

    parsed.wagers.forEach(function (block) {
      var plays = requireField(block.header, "Number of plays");
      var wager = requireField(block.header, "Wager amount");
      var basePrize = requireField(block.header, "Base game prize total");
      var shared = [pack(block.header, seedBalance(block.header, state))];
      var jps = block.jps.map(function (jp) {
        var packed = pack(jp, seedBalance(jp, state));
        shared.push(packed);
        if (!jp.wins) throw new Error(jp.name + ": missing Wins");
        var sum = jp.wins.reduce(function (a, b) { return a + b; }, 0);
        return {
          name: jp.name,
          numWins: requireField(jp, "Num wins"),
          largest: requireField(jp, "Largest Single Jackpot"),
          wins: jp.wins,
          sum: sum,
          pack: packed
        };
      });
      wagerResults.push(checkWager(config, plays, wager, basePrize, shared, jps, lines, tally));
      lines.push(" ");
    });

    lines.push("Summary");
    lines.push("Total tests:\t" + tally.checks);
    lines.push("Number of pass:\t" + tally.pass);
    lines.push("Number of fail:\t" + tally.fail);
    return {
      seedField: state.seedField,
      names: parsed.names,
      contriSplit: config.contriSplit,
      wagers: wagerResults,
      checks: tally.checks,
      pass: tally.pass,
      fail: tally.fail,
      report: lines.join("\n") + "\n"
    };
  }

  function pack(section, seedBalanceValue) {
    return {
      contriAward: requireField(section, "Total JP contributions awarded"),
      seedAward: requireField(section, "Total Seeds awarded"),
      jpAward: requireField(section, "Total JP awarded"),
      contriAvlb: requireField(section, "Total JP contributions available"),
      seedAvlb: seedBalanceValue,
      jpAvlb: requireField(section, "Total JP available"),
      contriBoth: requireField(section, "Total contribution awarded + available"),
      jpBoth: requireField(section, "Total JP awarded + available")
    };
  }

  function record(row, name, actual, lo, hi, pass) {
    row.checks.push({ name: name, actual: actual, lo: lo, hi: hi, pass: pass });
  }

  function checkWager(config, plays, wager, basePrize, shared, jps, lines, tally) {
    var row = { wager: wager, plays: plays, checks: [] };
    lines.push("Wager amount check:\t" + wager);
    lines.push("Number of plays:\t" + fmt(plays));

    var rtp = basePrize / (plays * wager);
    var rtpLo = round(config.defaultRTP - 3 * config.defaultStdDev / Math.pow(plays, 0.5), 5);
    var rtpHi = round(config.defaultRTP + 3 * config.defaultStdDev / Math.pow(plays, 0.5), 5);
    var rtpPass = rtp > rtpLo && rtp < rtpHi;
    lines.push("Expected RTP:\t" + config.defaultRTP + "\t");
    lines.push("Actual RTP:\t" + fmt(rtp) + "\t" + tally.mark(rtpPass));
    lines.push("99.5% Confidence Interval of RTP:");
    lines.push("RTP LowerBond:\t" + rtpLo);
    lines.push("RTP UpperBond:\t" + rtpHi);
    row.rtp = rtp; row.rtpLo = rtpLo; row.rtpHi = rtpHi;
    record(row, "Base game RTP", rtp, rtpLo, rtpHi, rtpPass);

    row.jpWins = jps.map(function (jp, j) {
      var prob = wager * config.oddsUp[j] / config.oddsDown;
      var margin = plays * 3 * Math.pow(prob * (1 - prob) / plays, 0.5);
      var hi = round(prob * plays + margin, 2);
      var lo = round(prob * plays - margin, 2);
      var pass = jp.numWins > lo && jp.numWins < hi;
      lines.push("Number of wins JP" + j + ":\t" + jp.numWins + "\t" + tally.mark(pass));
      lines.push("99.5% Confidence Interval of number of JP" + j + " wins:");
      lines.push("JP" + j + " wins LowerBond:\t" + lo);
      lines.push("JP" + j + " wins upperBond:\t" + hi);
      if (Math.abs(jp.wins.length - jp.numWins) > 1e-6) {
        lines.push("Warning:\tJP" + j + " listed " + jp.wins.length + " wins, Num wins is " + jp.numWins);
      }
      record(row, "JP" + j + " " + jp.name + " win count", jp.numWins, lo, hi, pass);
      return { name: jp.name, wins: jp.numWins, lo: lo, hi: hi, pass: pass, listed: jp.wins.length };
    });

    var header = shared[0];
    var awardedSum = 0, availableSum = 0;
    for (var i = 1; i < shared.length; i++) {
      awardedSum += shared[i].jpAward;
      availableSum += shared[i].jpAvlb;
    }
    awardedSum = round(awardedSum, 5);
    availableSum = round(availableSum, 5);
    var awardPass = Math.abs(round(header.jpAward, 5) - awardedSum) < 1e-9;
    emit(lines, tally, awardPass, "Total JP awarded:\t" + fmt(header.jpAward) + "\t", round(header.jpAward, 5), awardedSum);
    var avlbPass = Math.abs(round(header.jpAvlb, 5) - availableSum) < 1e-9;
    emit(lines, tally, avlbPass, "Total JP available:\t" + header.jpAvlb + "\t", round(header.jpAvlb, 5), availableSum);
    lines.push("Total JP awarded + available:\t" + fmt(header.jpBoth));
    var sumPass = round(header.jpBoth, 4) === round(header.jpAward + header.jpAvlb, 4);
    lines.push("Does the sum up match the Total JP awarded + available?\t\t" + tally.mark(sumPass));
    record(row, "Total JP awarded", header.jpAward, awardedSum, null, awardPass);
    record(row, "Total JP available", header.jpAvlb, availableSum, null, avlbPass);
    record(row, "Awarded + available", header.jpBoth, round(header.jpAward + header.jpAvlb, 4), null, sumPass);

    var expectedJp = round(config.seedRTP + config.contributionRtp, 6);
    var actualJp = round(header.jpBoth / (wager * plays), 6);
    var probAll = config.oddsUpSum * wager / config.oddsDown;
    var expectedWins = plays * probAll;
    var marginError = 3 * Math.pow(plays * probAll * (1 - probAll), 0.5);
    var jpLo = round((expectedWins - marginError) * config.avgJPSize / (plays * wager), 6);
    var jpHi = round((expectedWins + marginError) * config.avgJPSize / (plays * wager), 6);
    var jpPass = actualJp > jpLo && actualJp < jpHi;
    lines.push("Expected Total JP RTP:\t" + expectedJp);
    lines.push("Actual Total JP RTP:\t" + actualJp + "\t" + tally.mark(jpPass));
    lines.push("99.5% Confidence Interval of Total JP:");
    lines.push("Total JP LowerBond:\t" + jpLo);
    lines.push("Total JP UpperBond:\t" + jpHi);
    row.jpRtp = actualJp; row.jpLo = jpLo; row.jpHi = jpHi;
    record(row, "Total JP RTP", actualJp, jpLo, jpHi, jpPass);

    var contriExpected = round(config.contributionRtp * plays * wager, 5);
    var contriPass = Math.abs(round(header.contriBoth, 5) - contriExpected) < 1e-9;
    emit(lines, tally, contriPass, "Total contribution awarded + available:\t" + fmt(header.contriBoth) + "\t", round(header.contriBoth, 5), contriExpected);
    record(row, "Contribution awarded + available", header.contriBoth, contriExpected, null, contriPass);

    row.perJp = jps.map(function (jp, j) {
      var avg = round(jp.sum / jp.wins.length, 5);
      var oddsUp = config.oddsUp[j] * wager / config.oddsDown;
      var sd = Math.pow(oddsUp * (1 - oddsUp) / plays, 0.5);
      var prizeHi = config.seeds[j] + (config.contriSplit[j] * wager / (oddsUp - 3 * sd));
      var prizeLo = config.seeds[j] + (config.contriSplit[j] * wager / (oddsUp + 3 * sd));
      return { name: jp.name, avg: avg, lo: prizeLo, hi: prizeHi, largest: jp.largest, pack: jp.pack, wins: jp.wins };
    });
    row.perJp.forEach(function (jp, j) {
      var p = jp.pack;
      var seedBoth = p.seedAvlb + p.seedAward;
      var seedExpected = round(config.seeds[j] + p.seedAward, 5);
      var seedPass = Math.abs(round(seedBoth, 5) - seedExpected) < 1e-9;
      emit(lines, tally, seedPass, "JP" + j + " seed awarded + available:\t" + fmt(seedBoth) + "\t", round(seedBoth, 5), seedExpected);
      var contriJpExpected = round(p.contriAvlb + p.contriAward, 5);
      var contriJpPass = Math.abs(round(p.contriBoth, 5) - contriJpExpected) < 1e-9;
      emit(lines, tally, contriJpPass, "JP" + j + " contribution awarded + available:\t" + fmt(p.contriBoth) + "\t", round(p.contriBoth, 5), contriJpExpected);
      record(row, "JP" + j + " seed awarded + available", seedBoth, seedExpected, null, seedPass);
      record(row, "JP" + j + " contribution awarded + available", p.contriBoth, contriJpExpected, null, contriJpPass);
    });
    row.perJp.forEach(function (jp, j) {
      var avgPass = jp.avg > jp.lo && jp.avg < jp.hi;
      lines.push("Avg. Prize of JP" + j + " Wins:\t" + jp.avg + "\t" + tally.mark(avgPass));
      lines.push("99.5% Confidence Interval of Prize of JP" + j + ":");
      lines.push("Prize of JP" + j + " LowerBond:\t" + round(jp.lo, 5));
      lines.push("Prize of JP" + j + " UpperBond:\t" + round(jp.hi, 5));
      lines.push("Expected JP" + j + " Wins:\t" + config.targets[j]);
      lines.push("Largest JP" + j + ":\t" + fmt(jp.largest));
      var above = jp.wins.every(function (win) { return win >= config.seeds[j]; });
      lines.push("Is every JP" + j + " wins above seed? \t\t" + tally.mark(above));
      jp.avgPass = avgPass;
      jp.above = above;
      record(row, "Avg. prize of JP" + j + " " + jp.name, jp.avg, jp.lo, jp.hi, avgPass);
      record(row, "Every JP" + j + " win above seed " + config.seeds[j], null, config.seeds[j], null, above);
    });
    return row;
  }

  function firstCell(row) {
    for (var i = 0; i < row.length; i++) {
      if (row[i] !== null && row[i] !== undefined && row[i] !== "") return { i: i, v: row[i] };
    }
    return null;
  }

  function cellText(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function headerIndex(row, needle) {
    var want = needle.toLowerCase();
    for (var i = 0; i < row.length; i++) {
      if (cellText(row[i]).toLowerCase().indexOf(want) >= 0) return i;
    }
    return -1;
  }

  function stakeOf(name) {
    var text = String(name).replace(/[$,\s]/g, "");
    if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
    return parseFloat(text);
  }

  function parseStake(wager, rows) {
    var tickets = null, bet = null, base = null;
    var byId = {};
    var mode = null;
    var winCol = 1;
    var amountCol = 2;
    var seenTicket = false;
    function pool(id) {
      if (!id) return null;
      if (!byId[id]) byId[id] = { id: id, paid: null, hits: null, contrib: null, reset: null, wins: [] };
      return byId[id];
    }
    rows.forEach(function (row) {
      var head = firstCell(row);
      if (!head) { mode = null; return; }
      var key = cellText(head.v);
      if (key === "Ticket Number") { mode = "head"; return; }
      if (mode === "head" && cellNumber(head.v) !== null) {
        tickets = cellNumber(row[head.i]);
        bet = cellNumber(row[head.i + 1]);
        seenTicket = true;
        mode = null;
        return;
      }
      if (key === "Jackpot ID" && cellText(row[head.i + 1]) === "Jackpot Win") { mode = "jpwin"; return; }
      if (key === "Win without jackpots") { mode = "base"; return; }
      if (mode === "base") { base = cellNumber(head.v); mode = null; return; }
      if (key === "Jackpot ID" && cellText(row[head.i + 1]) === "Number of Jackpots") { mode = "count"; return; }
      if (key === "Jackpot ID" && cellText(row[head.i + 1]).toLowerCase().indexOf("contribution") >= 0) { mode = "contrib"; return; }
      if (key === "Jackpot ID" && headerIndex(row, "jackpot amount") >= 0) {
        mode = "end";
        amountCol = headerIndex(row, "jackpot amount");
        return;
      }
      if (key === "Jackpot Wins") { mode = null; return; }
      if (key === "Jackpot ID" && (headerIndex(row, "total_jackpot") >= 0 || headerIndex(row, "amount") >= 0)) {
        mode = "wins";
        winCol = headerIndex(row, "total_jackpot");
        if (winCol < 0) winCol = headerIndex(row, "amount");
        return;
      }
      if (key === "Standard Deviation" || key === "RTP without jackpots" || key === "Jackpots RTP") { mode = null; return; }
      if (mode === "jpwin" || mode === "count" || mode === "contrib" || mode === "end" || mode === "wins") {
        var item = pool(key);
        if (!item) return;
        if (mode === "jpwin") item.paid = cellNumber(row[head.i + 1]) || 0;
        else if (mode === "count") item.hits = cellNumber(row[head.i + 1]) || 0;
        else if (mode === "contrib") item.contrib = cellNumber(row[head.i + 1]) || 0;
        else if (mode === "end") item.reset = cellNumber(row[amountCol]);
        else {
          var amount = cellNumber(row[winCol]);
          if (amount !== null) item.wins.push(amount);
        }
      }
    });
    if (!seenTicket || bet === null || base === null) return null;
    Object.keys(byId).forEach(function (id) {
      var item = byId[id];
      if (item.paid === null) item.paid = item.wins.reduce(function (sum, value) { return sum + value; }, 0);
      if (item.hits === null) item.hits = item.wins.length;
      if (item.contrib === null) item.contrib = 0;
    });
    return { wager: wager, tickets: tickets, bet: bet, base: base, byId: byId };
  }

  function cellNumber(value) {
    if (typeof value === "number" && isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && isFinite(Number(value))) return Number(value);
    return null;
  }

  function parseRtpBook(book) {
    var stakes = [];
    var seen = [];
    Object.keys(book).forEach(function (name) {
      var wager = stakeOf(name);
      if (wager === null) return;
      var sheet = parseStake(wager, book[name] || []);
      if (!sheet) return;
      stakes.push(sheet);
      Object.keys(sheet.byId).forEach(function (id) {
        if (seen.indexOf(id) < 0) seen.push(id);
      });
    });
    if (!stakes.length) {
      throw new Error("This workbook has no stake sheets. An rtp-test file has one sheet per stake, starting with Ticket Number.");
    }
    stakes.sort(function (a, b) { return a.wager - b.wager; });
    var pools = seen.map(function (id) {
      var reset = null;
      stakes.forEach(function (sheet) {
        var item = sheet.byId[id];
        if (item && item.reset !== null) reset = item.reset;
      });
      return { id: id, reset: reset };
    });
    pools.sort(function (a, b) {
      if (a.reset === null) return 1;
      if (b.reset === null) return -1;
      return a.reset - b.reset;
    });
    return { stakes: stakes, pools: pools };
  }

  function blankPool() {
    return { paid: 0, hits: 0, contrib: 0 };
  }

  function runSample(sample, input) {
    var config = buildConfig(input);
    if (sample.pools.length !== config.numOfJPs) {
      throw new Error("The rtp-test file has " + sample.pools.length + " jackpot(s) (" + sample.pools.map(function (pool) { return pool.id; }).join(", ") + ") and the PPS has " + config.numOfJPs + ".");
    }
    var used = {};
    var paired = [];
    for (var i = 0; i < config.numOfJPs; i++) {
      var best = -1;
      var bestDistance = Infinity;
      sample.pools.forEach(function (pool, index) {
        if (used[index] || pool.reset === null) return;
        var distance = Math.abs(pool.reset - config.seeds[i]);
        if (distance < bestDistance) { bestDistance = distance; best = index; }
      });
      if (best >= 0 && bestDistance <= 1e-6) {
        used[best] = true;
        paired.push(sample.pools[best]);
      } else paired.push(null);
    }
    if (paired.some(function (pool) { return !pool; })) paired = sample.pools.slice();
    var totalBet = 0;
    var totalBase = 0;
    var totals = paired.map(blankPool);
    var rows = sample.stakes.map(function (sheet) {
      totalBet += sheet.bet;
      totalBase += sheet.base;
      var paid = 0;
      var pools = paired.map(function (pool, index) {
        var item = sheet.byId[pool.id] || blankPool();
        totals[index].paid += item.paid;
        totals[index].hits += item.hits;
        totals[index].contrib += item.contrib;
        paid += item.paid;
        return {
          id: pool.id,
          hits: item.hits,
          expected: sheet.tickets * sheet.wager * config.oddsUp[index] / config.oddsDown,
          paid: item.paid,
          contrib: item.contrib
        };
      });
      return {
        wager: sheet.wager,
        tickets: sheet.tickets,
        bet: sheet.bet,
        baseRtp: sheet.base / sheet.bet,
        jpRtp: paid / sheet.bet,
        pools: pools
      };
    });
    var pools = paired.map(function (pool, index) {
      var seedRtp = config.seeds[index] * config.oddsUp[index] / config.oddsDown;
      return {
        id: pool.id,
        reset: pool.reset,
        seed: config.seeds[index],
        oddsUp: config.oddsUp[index],
        seedRtp: seedRtp,
        contriRtp: config.contriSplit[index],
        targetRtp: seedRtp + config.contriSplit[index],
        paid: totals[index].paid,
        hits: totals[index].hits,
        expected: totalBet * config.oddsUp[index] / config.oddsDown,
        contrib: totals[index].contrib,
        paidRtp: totals[index].paid / totalBet,
        contribShare: totals[index].contrib / totalBet
      };
    });
    var jpPaid = pools.reduce(function (sum, pool) { return sum + pool.paid; }, 0);
    var summary = {
      bet: totalBet,
      baseRtp: totalBase / totalBet,
      jpRtp: jpPaid / totalBet,
      totalRtp: (totalBase + jpPaid) / totalBet,
      mainRtp: config.defaultRTP,
      jpTarget: config.seedRTP + config.contributionRtp,
      totalTarget: config.defaultRTP + config.seedRTP + config.contributionRtp
    };
    return {
      kind: "sample",
      names: pools.map(function (pool) { return pool.id; }),
      rows: rows,
      pools: pools,
      summary: summary,
      report: sampleReport(summary, pools, rows, config)
    };
  }

  function pct(value, digits) {
    return (value * 100).toFixed(digits) + "%";
  }

  function hitText(value) {
    if (Math.abs(value - Math.round(value)) < 1e-6) return String(Math.round(value));
    return value.toFixed(1);
  }

  function sampleReport(summary, pools, rows, config) {
    var lines = [];
    lines.push("Small-sample rtp test");
    lines.push("Stakes: " + rows.length + ", " + rows.map(function (row) { return "$" + row.wager; }).join(", "));
    lines.push("Tickets per stake: " + rows[0].tickets);
    lines.push("Total stake: " + summary.bet);
    lines.push("");
    lines.push("Pooled, paid");
    lines.push("Base " + pct(summary.baseRtp, 3) + "    PPS " + pct(summary.mainRtp, 3));
    lines.push("JP   " + pct(summary.jpRtp, 3) + "    PPS " + pct(summary.jpTarget, 3));
    lines.push("Total " + pct(summary.totalRtp, 3) + "    PPS " + pct(summary.totalTarget, 3));
    lines.push("");
    lines.push("Jackpots, matched by reset amount");
    pools.forEach(function (pool, index) {
      lines.push("JP" + index + " " + pool.id + "    reset " + pool.reset + "    PPS seed " + pool.seed);
      lines.push("  Paid " + pct(pool.paidRtp, 3) + "    target " + pct(pool.targetRtp, 3) + " (seed " + pct(pool.seedRtp, 3) + " + contribution " + pct(pool.contriRtp, 3) + ")");
      lines.push("  Hits " + pool.hits + "    expected " + hitText(pool.expected));
      lines.push("  Contribution on the sheets " + pct(pool.contribShare, 3));
    });
    lines.push("");
    lines.push("Expected hits = tickets x stake x odds up / " + config.oddsDown + ".");
    lines.push("A stake whose expected hits are under 1 can print a jackpot RTP far from the target. The pooled line is the comparison.");
    lines.push("");
    lines.push("Stake    Base       JP         " + pools.map(function (pool) { return pool.id; }).join("    "));
    rows.forEach(function (row) {
      lines.push("$" + row.wager + "    " + pct(row.baseRtp, 2) + "    " + pct(row.jpRtp, 2) + "    " + row.pools.map(function (pool) {
        return pool.hits + "/" + hitText(pool.expected);
      }).join("    "));
    });
    return lines.join("\n") + "\n";
  }

  return { run: run, parseDump: parseDump, parseRtpBook: parseRtpBook, runSample: runSample, round: round };
});
