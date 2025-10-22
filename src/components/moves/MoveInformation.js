import { Chess } from "../../../libs/chess.js";
import { Classification } from "../../classification/MoveClassifier.js";

export const IgnoredSuggestionTypes = [
    Classification.BRILLIANT.type,
    Classification.GREAT.type,
    Classification.PERFECT.type,
    Classification.THEORY.type,
    Classification.FORCED.type
];

export class MoveInformation {
    constructor() {}

    /**
     * Converts a UCI string to a SAN string.
     * @param {string} uci - The UCI string to convert.
     * @param {string} fen - The FEN string to use for the conversion.
     * @returns {string} The SAN string.
     */
    static convertUCIToSAN(uci, fen) {
        const tempChess = new Chess(fen);
        const from = uci.substring(0, 2);
        const to = uci.substring(2, 4);
        const promotion = uci.length > 4 ? uci.substring(4, 5) : undefined;
        const moveObj = tempChess.move({ from, to, promotion });
        return moveObj.san;
    }

    /**
     * Updates the move information display.
     * @param {Object} node - The current move node.
     * @param {Object} prevNode - The previous move node.
     */
    static updateMoveInfo(node, prevNode) {
        const $moveInfo = $(".move-info").empty();

        // Show placeholder when at the root node or have no move data
        if (!node || node.id === 'root' || !node.move) {
            $("<div>").addClass("move-info-placeholder")
                .text("♟ Select a move to see its classification.")
                .appendTo($moveInfo);
            $moveInfo.addClass('is-empty');
            return;
        }
        $moveInfo.removeClass('is-empty');

        // Create container for move classification info
        const $moveInfoContainer = $("<div>").addClass("move-classification-info");

		// If we have a move selected but classification isn't ready yet, show a loading message
        if (!node.classification) {
			$("<div>").addClass("move-info-placeholder")
				.text("Analysing...")
				.appendTo($moveInfo);
            $moveInfo.addClass('is-empty');
			return;
		}
        $moveInfo.removeClass('is-empty');

        // Add the current move classification if available
		if (node.classification) {
            const $moveInfoLine = $("<div>").addClass("classification-line");

            // Left side - classification and move
            const $moveLeftSide = $("<div>").addClass("move-left-side");

            // Are the icons cached yet?
            const trueClassification = Classification[node.classification.toUpperCase()];
            if (trueClassification?.cachedImg) {
                const originalImg = trueClassification.cachedImg;
                const clone = originalImg.cloneNode(true);
                $moveLeftSide.append(clone);
            } else {
                $("<img>").addClass("move-icon")
                    .attr("src", trueClassification.src)
                    .attr("alt", node.classification)
                    .appendTo($moveLeftSide);
            }

            $("<span>").addClass("move")
                .addClass(trueClassification.class)
                .text(node.move.san + " " + trueClassification.comment)
                .appendTo($moveLeftSide);

            $moveInfoLine.append($moveLeftSide);

            // Right side - best move alternative
            if (node.evaluatedMove?.lines?.length > 0 && !IgnoredSuggestionTypes.includes(node.classification)) {

                // Get the previous position's best move
                if (prevNode?.evaluatedMove?.lines) {
                    const bestLine = prevNode.evaluatedMove.lines.find(line => line.id === 1);
                    if (bestLine) {
                        // Get best move UCI string - either from uciMove or first element of pv array
                        const bestMoveUci = bestLine.uciMove || (bestLine.pv && bestLine.pv.length > 0 ? bestLine.pv[0] : null);

                        if (bestMoveUci) {
                            const san = MoveInformation.convertUCIToSAN(bestMoveUci, prevNode.fen);
                            $("<div>").addClass("perfect-move-alternative")
                                .text("Best was " + san)
                                .appendTo($moveInfoLine);
                        }
                    }
                }
            }

            $moveInfoContainer.append($moveInfoLine);
        }

        // Add the container to the move-info div
        $moveInfo.append($moveInfoContainer);
    }

    /**
     * Shows learning mode feedback in the move info box
     * @param {string} message - The feedback message to display
     * @param {boolean|null} isCorrect - True for correct, false for incorrect, null for neutral
     */
    static showLearningFeedback(message, isCorrect) {
        const $moveInfo = $(".move-info").empty();
        $moveInfo.removeClass('is-empty');

        const feedbackClass = isCorrect === true ? 'learning-correct' : 
                            isCorrect === false ? 'learning-incorrect' : 
                            'learning-neutral';

        const $feedback = $("<div>")
            .addClass("learning-feedback")
            .addClass(feedbackClass)
            .html(message);

        $moveInfo.append($feedback);
    }
}