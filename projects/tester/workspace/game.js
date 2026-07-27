// Breakout game engine. The page provides the canvas and the small HUD.
const canvas = document.getElementById("game");
const context = canvas.getContext("2d");
const scoreLabel = document.getElementById("score");
const livesLabel = document.getElementById("lives");

const paddle = { x: 0, y: canvas.height - 34, width: 112, height: 14, speed: 560 };
const ball = { x: 0, y: 0, radius: 9, velocityX: 0, velocityY: 0 };
const brickLayout = { rows: 3, columns: 10, width: 68, height: 22, gap: 8, top: 72 };
const brickColors = ["#ff5c8a", "#ffbd59", "#62e6a7"];

let bricks = [];
let score = 0;
let lives = 3;
let gameState = "ready";
let previousTime = 0;
let animationId = 0;
let leftPressed = false;
let rightPressed = false;

// Builds a fresh grid of colorful bricks across the canvas.
function createBricks() {
  bricks = [];
  const gridWidth = brickLayout.columns * brickLayout.width
    + (brickLayout.columns - 1) * brickLayout.gap;
  const left = (canvas.width - gridWidth) / 2;

  for (let row = 0; row < brickLayout.rows; row += 1) {
    for (let column = 0; column < brickLayout.columns; column += 1) {
      bricks.push({
        x: left + column * (brickLayout.width + brickLayout.gap),
        y: brickLayout.top + row * (brickLayout.height + brickLayout.gap),
        width: brickLayout.width,
        height: brickLayout.height,
        color: brickColors[row],
        active: true,
      });
    }
  }
}

// Places the paddle and ball in their starting positions.
function resetRound() {
  paddle.x = (canvas.width - paddle.width) / 2;
  ball.x = canvas.width / 2;
  ball.y = paddle.y - ball.radius - 2;
  ball.velocityX = 245 * (Math.random() < 0.5 ? -1 : 1);
  ball.velocityY = -330;
}

// Copies the current score and lives into the page HUD.
function updateHud() {
  scoreLabel.textContent = String(score);
  livesLabel.textContent = String(lives);
}

// Starts a completely new game when the page button calls startGame().
function startGame() {
  cancelAnimationFrame(animationId);
  score = 0;
  lives = 3;
  gameState = "playing";
  createBricks();
  resetRound();
  updateHud();
  previousTime = performance.now();
  animationId = requestAnimationFrame(gameLoop);
}

// Keeps the paddle inside the canvas while responding to held arrow keys.
function movePaddle(deltaSeconds) {
  if (leftPressed) paddle.x -= paddle.speed * deltaSeconds;
  if (rightPressed) paddle.x += paddle.speed * deltaSeconds;
  paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x));
}

// Returns true when the circular ball overlaps a rectangular object.
function ballTouchesRectangle(rectangle) {
  const nearestX = Math.max(rectangle.x, Math.min(ball.x, rectangle.x + rectangle.width));
  const nearestY = Math.max(rectangle.y, Math.min(ball.y, rectangle.y + rectangle.height));
  const distanceX = ball.x - nearestX;
  const distanceY = ball.y - nearestY;
  return distanceX * distanceX + distanceY * distanceY <= ball.radius * ball.radius;
}

// Bounces the ball from walls, paddle, and bricks, and handles lost lives.
function updateBall(deltaSeconds) {
  ball.x += ball.velocityX * deltaSeconds;
  ball.y += ball.velocityY * deltaSeconds;

  if (ball.x - ball.radius <= 0 && ball.velocityX < 0) ball.velocityX *= -1;
  if (ball.x + ball.radius >= canvas.width && ball.velocityX > 0) ball.velocityX *= -1;
  if (ball.y - ball.radius <= 0 && ball.velocityY < 0) ball.velocityY *= -1;

  if (ball.velocityY > 0 && ballTouchesRectangle(paddle)) {
    const hitPosition = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
    ball.velocityX = hitPosition * 410;
    ball.velocityY = -Math.abs(ball.velocityY);
    ball.y = paddle.y - ball.radius;
  }

  for (const brick of bricks) {
    if (brick.active && ballTouchesRectangle(brick)) {
      brick.active = false;
      ball.velocityY *= -1;
      score += 10;
      updateHud();
      break;
    }
  }

  if (bricks.every((brick) => !brick.active)) {
    gameState = "won";
  } else if (ball.y - ball.radius > canvas.height) {
    lives -= 1;
    updateHud();
    if (lives === 0) gameState = "lost";
    else resetRound();
  }
}

// Draws a rounded rectangle used for the paddle and bricks.
function drawRoundedRectangle(x, y, width, height, radius, color) {
  context.fillStyle = color;
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
}

// Paints the paddle, ball, and all remaining bricks.
function drawGame() {
  context.clearRect(0, 0, canvas.width, canvas.height);

  for (const brick of bricks) {
    if (brick.active) {
      drawRoundedRectangle(brick.x, brick.y, brick.width, brick.height, 5, brick.color);
    }
  }

  drawRoundedRectangle(paddle.x, paddle.y, paddle.width, paddle.height, 7, "#68d7ff");
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  context.fill();
}

// Paints the final message directly on the canvas.
function drawEndMessage() {
  context.fillStyle = "rgba(8, 10, 24, 0.78)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.font = "bold 42px system-ui";
  context.fillText(gameState === "won" ? "You cleared the wall!" : "Game over", canvas.width / 2, 245);
  context.font = "20px system-ui";
  context.fillText("Press Start to play again", canvas.width / 2, 285);
}

// Advances and redraws the game once per animation frame.
function gameLoop(currentTime) {
  const deltaSeconds = Math.min((currentTime - previousTime) / 1000, 0.033);
  previousTime = currentTime;
  movePaddle(deltaSeconds);
  updateBall(deltaSeconds);
  drawGame();

  if (gameState === "playing") animationId = requestAnimationFrame(gameLoop);
  else drawEndMessage();
}

// Records whether a supported keyboard direction is being held.
function handleKey(event, isPressed) {
  if (event.key === "ArrowLeft") leftPressed = isPressed;
  if (event.key === "ArrowRight") rightPressed = isPressed;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") event.preventDefault();
}

// Moves the paddle toward the mouse or finger position over the canvas.
function movePaddleToPointer(event) {
  const bounds = canvas.getBoundingClientRect();
  const scaleX = canvas.width / bounds.width;
  const pointerX = (event.clientX - bounds.left) * scaleX;
  paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, pointerX - paddle.width / 2));
}

document.addEventListener("keydown", (event) => handleKey(event, true));
document.addEventListener("keyup", (event) => handleKey(event, false));
canvas.addEventListener("pointermove", movePaddleToPointer);

// Expose the one function promised to the page's Start button.
window.startGame = startGame;

// Show the pieces at rest before the first game begins.
createBricks();
resetRound();
updateHud();
drawGame();
