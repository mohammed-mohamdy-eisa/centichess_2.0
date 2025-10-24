export class GameClassifier {
  constructor() {
    // Thresholds for classification
    this.BLUNDER_THRESHOLD = 0.25; // Minimum evaluation swing to be considered a blunder
    this.DECISIVE_ADVANTAGE = 0.75; // When a position is considered winning
    this.EQUAL_RANGE = 0.1; // Range around 0.5 considered equal
    this.VOLATILITY_THRESHOLD = 0.15; // Average swing for "wild" games
  }

  classifyGame(evaluations, perspective = 'w', gameResult = '*') {
    if (!evaluations || evaluations.length < 2) {
      return { classification: 'insufficient_data', message: 'Please select a game to analyze in the games tab by uploading a PGN or searching games!' };
    }

    const analysis = this.analyzeGame(evaluations);
    const message = this.generateMessage(analysis, perspective, gameResult);
    
    return {
      classification: analysis.gameType,
      message: message,
      details: {
        blunders: analysis.blunders,
        gameLength: evaluations.length,
        finalEval: evaluations[evaluations.length - 1],
        avgVolatility: analysis.avgVolatility,
        timeInAdvantage: analysis.timeInAdvantage
      }
    };
  }

  analyzeGame(evals) {
    const swings = this.calculateSwings(evals);
    const blunders = this.findBlunders(evals, swings);
    const volatility = this.calculateVolatility(swings);
    const timeInAdvantage = this.calculateTimeInAdvantage(evals);
    const gamePhases = this.identifyGamePhases(evals);
    const comeback = this.detectComeback(evals);
    const crushing = this.detectCrushingVictory(evals);

    // Determine game type based on analysis
    let gameType = 'balanced';
    
    if (blunders.length >= 1 && blunders.some(b => b.magnitude >= this.BLUNDER_THRESHOLD * 1.5)) {
      gameType = 'blunder_decided';
    } else if (crushing.isCrushing) {
      gameType = 'crushing';
    } else if (comeback.hadComeback) {
      gameType = 'comeback';
    } else if (volatility >= this.VOLATILITY_THRESHOLD) {
      gameType = 'volatile';
    } else if (timeInAdvantage.white > 0.7 || timeInAdvantage.black > 0.7) {
      gameType = 'dominant';
    } else if (Math.abs(evals[evals.length - 1] - 0.5) < this.EQUAL_RANGE) {
      gameType = 'close_finish';
    }

    return {
      gameType,
      blunders,
      avgVolatility: volatility,
      timeInAdvantage,
      gamePhases,
      finalEval: evals[evals.length - 1],
      comeback,
      crushing
    };
  }

  calculateSwings(evals) {
    const swings = [];
    for (let i = 1; i < evals.length; i++) {
      swings.push(evals[i] - evals[i - 1]);
    }
    return swings;
  }

  findBlunders(evals, swings) {
    const blunders = [];
    
    for (let i = 0; i < swings.length; i++) {
      const swing = Math.abs(swings[i]);
      if (swing >= this.BLUNDER_THRESHOLD) {
        const moveNumber = Math.floor((i + 1) / 2) + 1;
        const isWhiteMove = (i + 1) % 2 === 1;
        const blunderer = swings[i] > 0 ? 'black' : 'white';
        
        blunders.push({
          moveIndex: i + 1,
          moveNumber,
          isWhiteMove,
          blunderer,
          magnitude: swing,
          evalBefore: evals[i],
          evalAfter: evals[i + 1]
        });
      }
    }
    
    return blunders.sort((a, b) => b.magnitude - a.magnitude);
  }

  calculateVolatility(swings) {
    if (swings.length === 0) return 0;
    const avgSwing = swings.reduce((sum, swing) => sum + Math.abs(swing), 0) / swings.length;
    return avgSwing;
  }

  calculateTimeInAdvantage(evals) {
    let whiteAdvantage = 0;
    let blackAdvantage = 0;
    let equal = 0;

    evals.forEach(evaluation => {
      if (evaluation > 0.5 + this.EQUAL_RANGE) {
        whiteAdvantage++;
      } else if (evaluation < 0.5 - this.EQUAL_RANGE) {
        blackAdvantage++;
      } else {
        equal++;
      }
    });

    const total = evals.length;
    return {
      white: whiteAdvantage / total,
      black: blackAdvantage / total,
      equal: equal / total
    };
  }

  identifyGamePhases(evals) {
    const phases = [];
    let currentPhase = this.getPhaseType(evals[0]);
    let phaseStart = 0;

    for (let i = 1; i < evals.length; i++) {
      const newPhase = this.getPhaseType(evals[i]);
      if (newPhase !== currentPhase) {
        phases.push({
          type: currentPhase,
          start: phaseStart,
          end: i - 1,
          length: i - phaseStart
        });
        currentPhase = newPhase;
        phaseStart = i;
      }
    }

    // Add final phase
    phases.push({
      type: currentPhase,
      start: phaseStart,
      end: evals.length - 1,
      length: evals.length - phaseStart
    });

    return phases;
  }

  getPhaseType(evaluation) {
    if (evaluation > 0.5 + this.EQUAL_RANGE) return 'white_advantage';
    if (evaluation < 0.5 - this.EQUAL_RANGE) return 'black_advantage';
    return 'equal';
  }

  detectComeback(evals) {
    if (evals.length < 10) return { hadComeback: false };
    
    const midGame = Math.floor(evals.length * 0.6);
    const earlyAvg = evals.slice(5, midGame).reduce((a, b) => a + b, 0) / (midGame - 5);
    const lateAvg = evals.slice(midGame).reduce((a, b) => a + b, 0) / (evals.length - midGame);
    
    const comebackSwing = Math.abs(lateAvg - earlyAvg);
    const hadComeback = comebackSwing > 0.3;
    
    return {
      hadComeback,
      earlyAdvantage: earlyAvg > 0.5 ? 'white' : 'black',
      lateAdvantage: lateAvg > 0.5 ? 'white' : 'black',
      swingMagnitude: comebackSwing
    };
  }

  detectCrushingVictory(evals) {
    if (evals.length < 5) return { isCrushing: false };
    
    const finalThird = evals.slice(Math.floor(evals.length * 0.66));
    const avgFinalThird = finalThird.reduce((a, b) => a + b, 0) / finalThird.length;
    
    const isCrushing = avgFinalThird > 0.85 || avgFinalThird < 0.15;
    const crusher = avgFinalThird > 0.85 ? 'white' : 'black';
    
    return {
      isCrushing,
      crusher,
      dominance: Math.abs(avgFinalThird - 0.5)
    };
  }

  generateMessage(analysis, perspective, gameResult) {
    const { gameType, blunders, timeInAdvantage, finalEval, comeback, crushing } = analysis;
    const isWhite = perspective.toLowerCase() === 'w';
    
    // Determine actual game outcome based on result
    let outcome = 'draw'; // Default to draw
    let playerWon = false;
    
    if (gameResult === '1-0') { // White won
      outcome = 'white_wins';
      playerWon = !isWhite;
    } else if (gameResult === '0-1') { // Black won
      outcome = 'black_wins';
      playerWon = isWhite;
    } else if (gameResult === '1/2-1/2' || gameResult === '1/2' || gameResult.includes('1/2')) {
      outcome = 'draw';
      playerWon = false; // No one wins in a draw
    } else {
      // For ongoing games or unknown results, fall back to evaluation
      const whiteWon = finalEval > 0.5;
      playerWon = (isWhite && whiteWon) || (!isWhite && !whiteWon);
      outcome = whiteWon ? 'white_wins' : 'black_wins';
    }
    
    // Create a deterministic seed based on game characteristics
    const gameSeed = this.createGameSeed(analysis);
    
    switch (gameType) {
      case 'blunder_decided':
        return this.generateBlunderMessage(blunders, isWhite, outcome, playerWon, gameSeed);
      
      case 'crushing':
        return this.generateCrushingMessage(crushing, isWhite, outcome, playerWon, gameSeed);
      
      case 'comeback':
        return this.generateComebackMessage(comeback, isWhite, outcome, playerWon, gameSeed);
      
      case 'volatile':
        return this.generateVolatileMessage(outcome, playerWon, gameSeed);
      
      case 'dominant':
        return this.generateDominantMessage(timeInAdvantage, isWhite, outcome, playerWon, gameSeed);
      
      case 'close_finish':
        return this.generateCloseMessage(outcome, playerWon, gameSeed);
      
      default:
        return this.generateBalancedMessage(outcome, playerWon, gameSeed);
    }
  }

  createGameSeed(analysis) {
    // Create a deterministic seed based on game characteristics
    const { blunders, avgVolatility, timeInAdvantage, finalEval } = analysis;
    
    // Combine multiple game characteristics to create a unique but deterministic seed
    let seed = Math.floor(finalEval * 1000); // Final evaluation
    seed += Math.floor(avgVolatility * 10000); // Volatility
    seed += Math.floor(timeInAdvantage.white * 100); // Time advantage
    seed += blunders.length * 17; // Number of blunders
    
    // If there are blunders, add the biggest blunder magnitude
    if (blunders.length > 0) {
      seed += Math.floor(blunders[0].magnitude * 1000);
    }
    
    return seed;
  }

  getSeededIndex(seed, arrayLength) {
    // Simple deterministic pseudo-random selection
    return Math.abs(seed) % arrayLength;
  }

  generateBlunderMessage(blunders, isWhite, outcome, playerWon, gameSeed) {
    const biggestBlunder = blunders[0];
    const blundererIsPlayer = (biggestBlunder.blunderer === 'white' && isWhite) || 
                             (biggestBlunder.blunderer === 'black' && !isWhite);
    
    if (outcome === 'draw') {
      if (blundererIsPlayer) {
        const playerBlunderDrawMessages = [
          "The game was fairly balanced, but you made a significant error that your opponent couldn't quite convert into a win.",
          "You had a mistake that gave your opponent a big advantage, but they weren't able to find the winning continuation.",
          "A critical error on your part created winning chances for your opponent, but the game still ended in a draw.",
          "You made a costly mistake, but your opponent failed to capitalize fully and the game ended even.",
          "Despite a significant blunder that could have been decisive, both players ended up sharing the point.",
          "You gave your opponent a real opportunity with that mistake, but they couldn't find the finishing blow.",
          "That was a fortunate draw - your error handed your opponent excellent winning chances they couldn't convert.",
          "A critical misstep on your part, but your opponent was unable to navigate the resulting complexity.",
          "You dodged a bullet there - that mistake could have cost you the game, but your opponent let you off the hook.",
          "Your blunder shifted the advantage dramatically, yet neither player could secure the full point in the end."
        ];
        return playerBlunderDrawMessages[this.getSeededIndex(gameSeed + 13, playerBlunderDrawMessages.length)];
      } else {
        const opponentBlunderDrawMessages = [
          "Your opponent made a critical mistake that gave you winning chances, but the position proved difficult to convert.",
          "A significant error by your opponent created opportunities, though neither player could secure the full point.",
          "Your opponent's blunder offered you excellent winning chances, but the game still ended in a draw.",
          "Despite your opponent's costly mistake, the resulting position led to a drawn outcome.",
          "Your opponent made a big error, but the complexity of the position allowed them to hold the draw.",
          "Your opponent handed you a golden opportunity with that mistake, but finding the win proved elusive.",
          "A major error by your opponent gave you winning chances, yet the position's complexity led to a shared result.",
          "Your opponent's blunder opened the door wide, but you couldn't quite find the key to unlock the full point.",
          "Despite a significant mistake from your opponent, the resulting tactical complications ended in a draw.",
          "Your opponent got away with one there - that error should have been decisive, but they managed to hold on."
        ];
        return opponentBlunderDrawMessages[this.getSeededIndex(gameSeed + 14, opponentBlunderDrawMessages.length)];
      }
    } else if (blundererIsPlayer) {
      const playerBlunderMessages = [
        `That was a relatively even game, but you made a critical mistake that your opponent was able to capitalize on.`,
        `The game was fairly balanced until you made an error that your opponent took advantage of.`,
        `A competitive match overall, but one significant mistake on your part shifted the game in your opponent's favor.`,
        `You were holding your own well, but a key error gave your opponent the opportunity they needed.`,
        `The position was roughly equal, but you made a mistake that your opponent was able to convert.`,
        `You played well for most of the game, but one critical oversight proved costly.`,
        `A fairly even contest until a crucial mistake tipped the scales against you.`,
        `That was a close game, but your error at a key moment allowed your opponent to seize control.`,
        `You matched your opponent move for move, but one misstep was all it took to change the outcome.`,
        `The game hung in the balance until your mistake gave your opponent the decisive advantage.`
      ];
      return playerBlunderMessages[this.getSeededIndex(gameSeed, playerBlunderMessages.length)];
    } else {
      const opponentBlunderMessages = [
        `That was a relatively even game, but your opponent made one critical mistake that you were able to capitalize on.`,
        `A fairly balanced contest until your opponent made an error that you converted well.`,
        `The game was competitive throughout, but your opponent's mistake allowed you to take control.`,
        `You stayed patient in an equal position, and when your opponent made an error, you took advantage of it.`,
        `A well-fought game that could have gone either way, but your opponent's mistake gave you the win.`,
        `Great job punishing your opponent's error - you converted that mistake into a decisive advantage.`,
        `An even game until your opponent slipped, and you capitalized perfectly.`,
        `You played solidly and waited for your chance - when your opponent erred, you struck decisively.`,
        `That was a patient victory - you maintained the balance until your opponent's mistake gave you the opening.`,
        `Excellent conversion! Your opponent handed you an opportunity and you made no mistake in seizing it.`
      ];
      return opponentBlunderMessages[this.getSeededIndex(gameSeed + 1, opponentBlunderMessages.length)];
    }
  }

  generateVolatileMessage(outcome, playerWon, gameSeed) {
    if (outcome === 'draw') {
      const drawVolatileMessages = [
        "What a wild game! The evaluation swung back and forth dramatically, but neither player could convert their chances.",
        "A rollercoaster of a game with constant momentum shifts that ultimately ended fairly in a draw.",
        "That was an exciting battle with lots of ups and downs - a draw was a fitting end to such a dynamic game.",
        "The advantage changed hands multiple times in that thrilling contest, with both players sharing the point.",
        "An unpredictable game full of twists and turns that deserved the shared result.",
        "What an entertaining game! Both players had winning chances at different points, but neither could seal the deal.",
        "A tactical slugfest where the initiative kept switching sides - a fair draw after all those fireworks.",
        "The position was in constant flux throughout that game, making the draw a fitting conclusion to such chaos.",
        "Both players created serious threats in this double-edged game, but the complications led to a balanced result.",
        "A thrilling tactical battle! The evaluation graph looked like a mountain range, but the game ended level."
      ];
      return drawVolatileMessages[this.getSeededIndex(gameSeed + 11, drawVolatileMessages.length)];
    } else if (playerWon) {
      const playerWonVolatileMessages = [
        "That was a back-and-forth game with lots of ups and downs, but you managed to come out on top.",
        "The advantage swung back and forth throughout the game, but you emerged victorious in the end.",
        "A game with several momentum shifts where you pulled through for the win.",
        "The evaluation changed frequently in that dynamic game, but you found a way to win.",
        "An unpredictable game with multiple lead changes, but you managed to secure victory.",
        "What a tactical battle! The position swung wildly, but you navigated the chaos better.",
        "A thrilling game where both sides had their chances, but you ultimately came through.",
        "The advantage kept changing hands, but when it mattered most, you found the winning moves.",
        "A dynamic struggle with constant complications - great job keeping your composure to win.",
        "That was an exciting game! Despite the wild swings, you managed to bring home the point."
      ];
      return playerWonVolatileMessages[this.getSeededIndex(gameSeed + 2, playerWonVolatileMessages.length)];
    } else {
      const playerLostVolatileMessages = [
        "That was a back-and-forth game with twists and turns, though it didn't go your way in the end.",
        "A dynamic game where the position swung frequently, but your opponent managed to edge you out.",
        "A game with several momentum changes that didn't fall your way in the end.",
        "The advantage changed hands multiple times in that shifting game, but your opponent found the winning path.",
        "An unpredictable contest with multiple lead changes, though your opponent came out ahead.",
        "A wild tactical battle where both sides had chances, but your opponent navigated the chaos better.",
        "The evaluation swung dramatically throughout, but your opponent handled the complications more accurately.",
        "An exciting game with lots of twists - your opponent just managed to come out on top in the end.",
        "Both players created serious threats in that complex game, but your opponent found the decisive blow.",
        "A tactical rollercoaster where your opponent ultimately proved more precise in the critical moments."
      ];
      return playerLostVolatileMessages[this.getSeededIndex(gameSeed + 3, playerLostVolatileMessages.length)];
    }
  }

  generateDominantMessage(timeInAdvantage, isWhite, outcome, playerWon, gameSeed) {
    const playerAdvantageTime = isWhite ? timeInAdvantage.white : timeInAdvantage.black;
    
    if (outcome === 'draw') {
      if (playerAdvantageTime > 0.7) {
        const playerDominantDrawMessages = [
          "You had the upper hand for most of the game, but couldn't quite convert your advantage into a win.",
          "Despite controlling the game for long periods, your opponent managed to hold the draw.",
          "You maintained pressure throughout most of the game, but your opponent's defense proved resilient.",
          "Good positional play gave you a lasting advantage, though your opponent found a way to secure the draw.",
          "You dictated the tempo for most of the game, but the final result was a hard-fought draw.",
          "You dominated for most of the game, but your opponent found sufficient defensive resources.",
          "A frustrating result - you held the advantage throughout, but couldn't break through.",
          "You applied consistent pressure and controlled the position, yet your opponent defended accurately enough to draw.",
          "That was a positionally superior game from you, but your opponent's stubborn defense earned them half a point.",
          "You were clearly better for most of the game, but converting proved more difficult than expected."
        ];
        return playerDominantDrawMessages[this.getSeededIndex(gameSeed + 15, playerDominantDrawMessages.length)];
      } else {
        const opponentDominantDrawMessages = [
          "Your opponent had the initiative for most of the game, but you defended well to secure the draw.",
          "Despite being under pressure for long periods, you managed to hold your ground and earn a draw.",
          "Your opponent controlled much of the game, but you showed good defensive skills to split the point.",
          "A challenging game where your opponent had the upper hand, but your resilience earned you half a point.",
          "Your opponent maintained steady pressure, but you found the key defensive resources to draw.",
          "Great defensive effort! Your opponent was better throughout, but you held firm.",
          "You were under pressure for most of the game, but your accurate defense saved the half point.",
          "A valuable draw considering your opponent's domination - excellent defensive resilience.",
          "Your opponent controlled the game from start to finish, but you defended stubbornly to escape with a draw.",
          "That was a well-earned draw against sustained pressure - your defensive technique was solid."
        ];
        return opponentDominantDrawMessages[this.getSeededIndex(gameSeed + 16, opponentDominantDrawMessages.length)];
      }
    } else if (playerAdvantageTime > 0.7) {
      const playerDominantMessages = [
        "You controlled most of that game and maintained an advantage throughout.",
        "Good positional play - you established an edge early and kept it for most of the game.",
        "A solid performance where you took control and held it from start to finish.",
        "You dictated the pace of that game, maintaining pressure throughout.",
        "Nice game management - you built your advantage and converted it effectively.",
        "Excellent domination! You had the upper hand throughout and converted it smoothly.",
        "A convincing performance where you controlled the game from beginning to end.",
        "You established your advantage early and never let it slip - well played.",
        "Great strategic play! You maintained consistent pressure and your opponent never got back into the game.",
        "A commanding victory - you were in the driver's seat for the entire game."
      ];
      return playerDominantMessages[this.getSeededIndex(gameSeed + 4, playerDominantMessages.length)];
    } else {
      const opponentDominantMessages = [
        "Your opponent had the upper hand for most of the game and maintained their advantage well.",
        "Your opponent controlled the tempo from early on and you had limited opportunities to equalize.",
        "A challenging game where your opponent established an edge and kept it throughout.",
        "Your opponent maintained steady pressure, leaving you with fewer chances to create counterplay.",
        "Your opponent showed good positional understanding, building and maintaining their advantage.",
        "Your opponent dominated from the start and you never really got your pieces coordinated.",
        "A tough game - your opponent controlled the position throughout and gave you few chances.",
        "Your opponent played very solidly, establishing an advantage and never allowing you back in.",
        "Your opponent's superior position persisted throughout the game, limiting your counterplay options.",
        "A difficult game where your opponent's positional mastery left you struggling to find good moves."
      ];
      return opponentDominantMessages[this.getSeededIndex(gameSeed + 5, opponentDominantMessages.length)];
    }
  }

  generateCloseMessage(outcome, playerWon, gameSeed) {
    if (outcome === 'draw') {
      const drawCloseMessages = [
        "A hard-fought game! The position stayed balanced throughout and both players earned a well-deserved draw.",
        "A tight contest where neither player could gain the decisive advantage - a fair result.",
        "Both players fought well in this closely contested game that deservedly ended in a draw.",
        "The game remained even throughout, with both sides having their chances before agreeing to split the point.",
        "A competitive battle where the balance held - sometimes the most accurate result is a draw.",
        "An evenly-matched game where both players created opportunities but neither could break through.",
        "The evaluation stayed close from start to finish - a well-deserved draw for both players.",
        "Neither player could establish a meaningful advantage in this tightly contested battle.",
        "A battle of equals! The game was finely balanced throughout and ended fairly.",
        "Both sides had their moments in this close game, but the result was always going to be a draw."
      ];
      return drawCloseMessages[this.getSeededIndex(gameSeed + 10, drawCloseMessages.length)];
    } else if (playerWon) {
      const playerWonCloseMessages = [
        "A close game! The position stayed even right until the end, but you managed to edge out the victory.",
        "A narrow margin of victory in a game that could have gone either direction.",
        "You found a way to win in a tightly contested position.",
        "A tight finish where small details mattered - you found the winning path.",
        "The position remained balanced throughout, but you made the key decisions when it counted.",
        "What a nail-biter! You squeezed out the win in a game that was balanced until the very end.",
        "Great precision in a close game - you converted tiny advantages into a full point.",
        "That could have gone either way, but your accuracy in the critical moments made the difference.",
        "A razor-thin victory! You played the fine margins better in this evenly-matched contest.",
        "Excellent endgame technique - you turned a balanced position into a win."
      ];
      return playerWonCloseMessages[this.getSeededIndex(gameSeed + 6, playerWonCloseMessages.length)];
    } else {
      const playerLostCloseMessages = [
        "That was a close and well-fought game that could have gone either way until the end.",
        "A narrow loss in a game decided by small margins.",
        "Close to victory - that was a tight contest where small details made the difference.",
        "A well-fought game that remained even throughout, though it didn't go your way.",
        "The outcome was uncertain until the end, but your opponent just found the edge.",
        "A frustrating loss in such a close game - you were right there until the end.",
        "That was anyone's game until the final phase - your opponent just played the key moments better.",
        "Unlucky! That game was evenly balanced, but your opponent found the decisive continuation.",
        "A tough loss in a game where the margins were incredibly small.",
        "You played well in a balanced position, but your opponent's precision in critical moments was the difference."
      ];
      return playerLostCloseMessages[this.getSeededIndex(gameSeed + 7, playerLostCloseMessages.length)];
    }
  }

  generateBalancedMessage(outcome, playerWon, gameSeed) {
    if (outcome === 'draw') {
      const drawBalancedMessages = [
        "A solid, well-played game by both sides that ended in a fair draw.",
        "Both players demonstrated good chess understanding in this balanced contest that deservedly ended even.",
        "A competitive and even game where both sides played well - the draw reflects the quality of play.",
        "That was a well-fought, balanced game where neither player could gain the decisive edge.",
        "An evenly-matched contest where both players had their moments and shared the point fairly.",
        "A respectable game from both sides - the evaluation stayed balanced and the result was fitting.",
        "Good positional play by both players in this evenly-fought contest.",
        "Both players showed solid understanding in this game that naturally ended in a draw.",
        "A fair and balanced contest where both players demonstrated competent chess.",
        "Neither player made significant errors in this well-balanced game - a deserved draw."
      ];
      return drawBalancedMessages[this.getSeededIndex(gameSeed + 12, drawBalancedMessages.length)];
    } else if (playerWon) {
      const playerWonBalancedMessages = [
        "That was a well-balanced game where both sides had their chances. Good job converting your opportunities.",
        "A solid, evenly-matched contest where you made the most of your key moments.",
        "Both players created chances in that balanced game, but you converted when it mattered.",
        "An even and competitive game where you capitalized on your opportunities well.",
        "A balanced contest where both sides had their moments, but you executed your plans more effectively.",
        "Nice win in a balanced position - you played the critical moments better than your opponent.",
        "That was a fairly even game, but your superior execution in key positions made the difference.",
        "Good chess from both sides, but you showed better understanding at the crucial junctures.",
        "A competitive game where you found the right moves when it counted most.",
        "Well played! You navigated the balanced position more effectively than your opponent."
      ];
      return playerWonBalancedMessages[this.getSeededIndex(gameSeed + 8, playerWonBalancedMessages.length)];
    } else {
      const playerLostBalancedMessages = [
        "That was a solid, balanced game where both players fought well. Your opponent managed to convert their chances slightly better.",
        "A well-contested game with chances for both sides, but your opponent was more effective in the key moments.",
        "Both players created opportunities in that even contest, but your opponent converted theirs more effectively.",
        "A competitive and balanced game where you played well, but your opponent edged you out in execution.",
        "An evenly-matched game where both sides had their chances, but your opponent capitalized on theirs better.",
        "A fairly even game where your opponent played the critical moments with slightly more precision.",
        "Both players had their opportunities, but your opponent executed their plans more accurately.",
        "A balanced contest where small differences in execution favored your opponent.",
        "That was competitive throughout, but your opponent's decision-making was just a bit sharper.",
        "A reasonable performance, but your opponent navigated the balanced positions more effectively."
      ];
      return playerLostBalancedMessages[this.getSeededIndex(gameSeed + 9, playerLostBalancedMessages.length)];
    }
  }

  generateCrushingMessage(crushing, isWhite, outcome, playerWon, gameSeed) {
    const crusherIsPlayer = (crushing.crusher === 'white' && isWhite) || 
                           (crushing.crusher === 'black' && !isWhite);
    
    if (playerWon || (outcome === 'draw' && crusherIsPlayer)) {
      const playerCrushingMessages = [
        "A dominant performance! You completely overwhelmed your opponent from start to finish.",
        "That was a crushing victory - your opponent never had a chance to get into the game.",
        "Exceptional play! You built an overwhelming advantage and never let up.",
        "A one-sided game where you totally outplayed your opponent. Very impressive!",
        "Devastating chess! Your opponent was completely outclassed throughout.",
        "What a demolition! You controlled every aspect of that game from beginning to end.",
        "An emphatic victory - your opponent had no answers to your superior play.",
        "Outstanding performance! You dominated the position so thoroughly your opponent couldn't create any counterplay.",
        "A commanding display of chess - you made it look easy with your overwhelming superiority.",
        "Absolutely crushing! Your opponent was never in this game from the opening onwards.",
        "Brilliant domination! You steamrolled through your opponent's defenses.",
        "A masterclass in domination - your opponent was helpless against your powerful play."
      ];
      return playerCrushingMessages[this.getSeededIndex(gameSeed + 17, playerCrushingMessages.length)];
    } else {
      const opponentCrushingMessages = [
        "A tough game - your opponent dominated from start to finish and you struggled to find any counterplay.",
        "That was a difficult loss - your opponent was significantly stronger throughout the entire game.",
        "Your opponent completely outplayed you in this one-sided contest.",
        "A challenging game where your opponent's superior play left you with no real chances.",
        "Your opponent was overwhelming in that game - you never really got your pieces working.",
        "A one-sided affair where your opponent controlled everything from the opening to the endgame.",
        "That was a crushing defeat - your opponent's dominance was total and you had few opportunities.",
        "Your opponent played at a much higher level throughout, leaving you searching for counterplay that never came.",
        "A humbling loss where your opponent's superiority was evident in every phase of the game.",
        "Your opponent was simply too strong - you were under pressure from start to finish with no relief.",
        "A difficult game where your opponent's powerful play gave you no chance to get into the contest.",
        "Your opponent's crushing superiority left you overwhelmed and unable to create meaningful resistance."
      ];
      return opponentCrushingMessages[this.getSeededIndex(gameSeed + 18, opponentCrushingMessages.length)];
    }
  }

  generateComebackMessage(comeback, isWhite, outcome, playerWon, gameSeed) {
    const playerHadEarlyAdvantage = (comeback.earlyAdvantage === 'white' && isWhite) || 
                                    (comeback.earlyAdvantage === 'black' && !isWhite);
    const playerHadLateAdvantage = (comeback.lateAdvantage === 'white' && isWhite) || 
                                   (comeback.lateAdvantage === 'black' && !isWhite);
    
    if (outcome === 'draw') {
      if (playerHadEarlyAdvantage) {
        const playerLostAdvantageDrawMessages = [
          "You started strong with a nice advantage, but your opponent fought back to secure the draw.",
          "A promising start for you, but your opponent's resilience earned them half a point.",
          "You were better in the early game, but couldn't maintain it against your opponent's comeback.",
          "Good opening play gave you an edge, but your opponent recovered well to split the point.",
          "You had the upper hand early on, but your opponent's fighting spirit saved the draw.",
          "You built an advantage in the opening and middlegame, but it slipped away in the later stages.",
          "A frustrating result - you were clearly better early on, but your opponent clawed their way back.",
          "You were in control initially, but your opponent's counter-attack leveled the game.",
          "Strong opening play from you, but your opponent's comeback prevented you from converting.",
          "You dominated early but couldn't maintain your advantage against determined resistance."
        ];
        return playerLostAdvantageDrawMessages[this.getSeededIndex(gameSeed + 19, playerLostAdvantageDrawMessages.length)];
      } else {
        const playerMadeDrawComebackMessages = [
          "Great comeback! You were under pressure early but fought back brilliantly to earn the draw.",
          "Excellent fighting spirit - despite being worse early on, you recovered to split the point.",
          "You were in trouble early, but showed great resilience to level the game and secure the draw.",
          "Impressive recovery! Your opponent had the advantage, but you didn't give up and earned the draw.",
          "Well fought! You turned a difficult position into a respectable draw.",
          "Your opponent had you on the ropes early, but you showed character to fight back for the draw.",
          "A hard-earned draw after being under pressure for much of the game - good determination!",
          "You faced an uphill battle early on, but your persistence paid off with a draw.",
          "Excellent defensive resources! You were worse for much of the game but found a way to hold.",
          "Great comeback from a difficult position - you never stopped fighting and earned your reward."
        ];
        return playerMadeDrawComebackMessages[this.getSeededIndex(gameSeed + 20, playerMadeDrawComebackMessages.length)];
      }
    } else if (playerWon) {
      if (playerHadLateAdvantage) {
        const playerComebackWinMessages = [
          "What a comeback! You were worse early on but turned it around completely to win.",
          "Incredible fighting spirit! You recovered from a difficult position to secure victory.",
          "Amazing turnaround - you were under pressure but fought back brilliantly to win.",
          "You were struggling early, but showed great resilience to turn the game around and win!",
          "Fantastic comeback! Your opponent had the advantage, but you never gave up and found a way to win.",
          "Impressive recovery! You went from a worse position to winning - that's real fighting chess!",
          "You faced adversity early but showed character to complete a remarkable comeback victory.",
          "Outstanding! You refused to accept a bad position and fought your way to an unlikely win.",
          "What determination! You turned a losing position into a winning one through sheer perseverance.",
          "A memorable comeback win - you were down but definitely not out, and proved it!",
          "Brilliant resilience! Your opponent had the better position, but you outplayed them when it counted."
        ];
        return playerComebackWinMessages[this.getSeededIndex(gameSeed + 21, playerComebackWinMessages.length)];
      } else {
        const playerLostAdvantageStillWonMessages = [
          "You started with an advantage and despite some wobbles, managed to secure the win. Well done!",
          "A bit of a rollercoaster, but you converted your early advantage into victory.",
          "You were better early on, let it slip briefly, but recovered to win in the end.",
          "Not the smoothest path, but you started strong and ultimately brought home the point.",
          "You had the advantage early, lost it temporarily, but showed composure to win anyway.",
          "A slightly bumpy road to victory, but your early advantage ultimately proved decisive.",
          "You made it harder than it needed to be, but your initial superiority carried you through.",
          "Despite letting your advantage slip at times, you kept your composure and won.",
          "You were better early, faced some resistance, but your initial work paid off with victory.",
          "A win's a win! You started strong and despite some complications, you got the job done."
        ];
        return playerLostAdvantageStillWonMessages[this.getSeededIndex(gameSeed + 22, playerLostAdvantageStillWonMessages.length)];
      }
    } else {
      // Player lost
      if (playerHadEarlyAdvantage) {
        const playerLostAdvantageAndGameMessages = [
          "A painful loss - you had a winning advantage early but let it slip away completely.",
          "That's a tough one to take. You were much better early on, but your opponent staged a remarkable comeback.",
          "Frustrating result - you dominated early but couldn't maintain it and ended up losing.",
          "You had the game in your hands early on, but your opponent's comeback was decisive.",
          "A disappointing loss after such a promising start - your early advantage evaporated.",
          "You were winning at one point, but your opponent turned it around completely. Hard luck!",
          "That stings - you were clearly better early, but lost your way and your opponent capitalized.",
          "A game that got away from you. Your strong opening wasn't enough against your opponent's comeback.",
          "You had your chances early but couldn't convert, and your opponent punished you in the end.",
          "Tough to lose from a winning position - your opponent showed great fighting spirit to turn it around."
        ];
        return playerLostAdvantageAndGameMessages[this.getSeededIndex(gameSeed + 23, playerLostAdvantageAndGameMessages.length)];
      } else {
        const playerCamebackButLostMessages = [
          "You fought hard to recover from a difficult position, but your opponent held on to win.",
          "Good effort to comeback from being worse, but your opponent's early advantage proved too much.",
          "You showed fighting spirit to improve your position, but couldn't quite complete the turnaround.",
          "You recovered well from a poor start, but your initial deficit was decisive in the end.",
          "Commendable comeback attempt, but your opponent maintained enough advantage to win.",
          "You made it interesting with your recovery, but the early damage was too significant.",
          "Good resilience to fight back, but your opponent's head start was ultimately the difference.",
          "You didn't give up and improved your position, but couldn't fully overcome the early deficit.",
          "A valiant comeback effort that came close but wasn't quite enough to save the game.",
          "You fought back well from being worse, but your opponent's initial advantage held firm."
        ];
        return playerCamebackButLostMessages[this.getSeededIndex(gameSeed + 24, playerCamebackButLostMessages.length)];
      }
    }
  }
}