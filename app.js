var fs =require('fs'), 
	http=require('http'), 
	socketio=require('socket.io');

//An array of JSON objects which store all the necessary game data, such as the player IDs and turns
var gameArray = [];

var server=http.createServer(function(req, res) {
    res.writeHead(200, { 'Content-type': 'text/html'});
    res.end(fs.readFileSync(__dirname+'/index.html'));
    }).listen(8080, function() {
    console.log('Listening at: http://localhost:8080');
 });
            
socketio.listen(server).on('connection', function (socket) {

	//Sets up the game for a newly connected player, including registering their piece
	playerSetup(socket);
	
	console.log(gameArray);
	console.log('\n\n\n')



	//Tracks messages sent from a client
    socket.on('message', function (msg) {
    	console.log("message: " + msg);

       var cellNum;
       var winPiece;
       if (msg.slice(0,-1) === 'continue') {
       	cellNum = msg.slice(-1);
       	msg = msg.slice(0,-1);
       	//console.log("cellNum: " + cellNum + ", remaining message: " + msg);
       }
       else if (msg.slice(0,-2) === 'victory') {
       	winPiece = msg.slice(-2, -1); //The second last char is the win piece
       	cellNum = msg.slice(-1); //the last char is the cell number
       	msg = msg.slice(0, -2);
       }
       else if (msg.slice(0,-1) === 'draw') {
       	cellNum = msg.slice(-1);
       	msg = msg.slice(0, -1);
       }

       //Determine the type of message received
       switch (msg) {
       	//Handle when a player declares itself victorious
       	case "victory":
       		//Find the game that just had a victory
       		for (var i = 0; i < gameArray.length; i++) {
       			//If player 1 won, send a message to player 2
       			if (gameArray[i].player1.id == socket.id) {
		       		gameArray[i].player2.emit('endGame', winPiece, cellNum);
				gameArray[i].player2.emit('updateBoard', cellNum);
       			}
		       	//Otherwise notify player 1 of player 2's victory
		       	if (gameArray[i].player2.id == socket.id) {
		       		gameArray[i].player1.emit('endGame', winPiece, cellNum);
				gameArray[i].player1.emit('updateBoard', cellNum);
		       	}

		       	//And finally notify the winner 
	       		socket.emit('endGame', winPiece);
	       		break;
	       	}
       		break;
       	
       	//Handle a game draw
       	case "draw":
       		for (var i = 0; i < gameArray.length; i++) {
       			//If player 1 won, send a message to player 2
       			if (gameArray[i].player1.id == socket.id)
		       		gameArray[i].player2.emit('endGame', "draw", cellNum);
		       	//Otherwise notify player 1 of player 2's victory
		       	if (gameArray[i].player2.id == socket.id)
		       		gameArray[i].player1.emit('endGame', "draw", cellNum);
		    }
       		socket.emit('endGame', "draw")
       		break;

       	//Handle a player ending their turn
       	case "continue":
       		//Find which game and player just finished their turn
       		for (var i = 0; i < gameArray.length; i++) {
       			//Player 1 just finished their turn
       			if(socket.id === gameArray[i].player1.id) {
       				//Change the current turn to player 2
       				gameArray[i].curPlayerTurn = 2;
       				//Send a message to the two players to update their turn/board
       				if (gameArray[i].player2 !== null) {
	       				gameArray[i].player2.emit('updateBoard', cellNum);
	       				gameArray[i].player2.emit('notifyTurn', true);
       				}
       				//do it here!!!
       			}
       			//Player 2 just finished their turn
       			else if (socket.id === gameArray[i].player2.id) {
       				gameArray[i].player1.emit('updateBoard', cellNum);
	       			gameArray[i].player1.emit('notifyTurn', true);
       			}
       		}
       		break;

       	case "reset":
       		//Find the game & player which requested the reset
       		for (var i = 0; i < gameArray.length; i++) {
       			if(socket.id === gameArray[i].player1.id) {
       				//tell player 2 of this game to reset their board
       				gameArray[i].player2.emit('reset', true);
       				//Update the player's piece/game info
       				gameArray[i].player2.emit('pieceRegistration', 'O', 'You are playing as O\n in game ' + (i + 1));
				socket.emit('pieceRegistration', 'X', "You are playing as X\n in game " + (i+1));
       				break;
       			}

       			else if (socket.id === gameArray[i].player2.id) {
       				gameArray[i].player1.emit('reset', true);
       				gameArray[i].player1.emit('pieceRegistration', 'X', 'You are playing as X\n in game ' + (i + 1));
				socket.emit('pieceRegistration', 'O', "You are playing as O\n in game " + (i+1));
       				break;
       			}
       		}
       		break;
       }
       //socket.broadcast.emit('message', msg);
 	});


 	//Handle a client disconnection
 	socket.on('disconnect', function() {
 		var playerIndex;
		for (var i = 0; i < gameArray.length; i++) {
			//Player 1 at index 'i' has disconnected
			if (gameArray[i].player1.id === socket.id) {
				//Need to add the remaining player 2 to a new game
				if (gameArray[i].player2 !== null) {
					//Add the remaining player to a new game
					/*gameArray.push({
						'player1' : gameArray[i].player2,
						'player2' : null,
						'curPlayerTurn' : 1
					});*/
					gameArray[i].player1 = gameArray[i].player2;
					gameArray[i].player2 = null;
					gameArray[i].curPlayerTurn = 1;

					console.log(gameArray);
					
					//Send the remaining player a message containing their new piece and game number
					var piece = 'X';
					var newPieceMsg = 'You are playing as X' + 
										'\n in game ' + (i + 1);
					gameArray[i].player1.emit('pieceRegistration', piece, newPieceMsg);

					//Reset the new player 1's game board
					gameArray[i].player1.emit("reset", true);

					gameArray[i].player1.emit("notifyTurn", false, true);
				}
				//Remove one item (the disconnected user) at the user's index in gameArray
				//gameArray.splice(i, 1);
			}
			else if (gameArray[i].player2.id === socket.id)
				gameArray[i].player2 = null;
		}
 	});
});


//Determines the piece the newly connected player will be, and emits a message notifying the client
function playerSetup(socket) {
	var playerPiece;

	//Track the newly connected client by registering them in the next available game
	if (gameArray.length === 0 || //Register first client,
		gameArray[gameArray.length - 1].player2 !== null)  //Or the next client will be the player1 of the next game, -> 'X')
	{
		gameArray.push({
			'player1' : socket,
			'player2' : null,
			'curPlayerTurn' : 1
		});
		playerPiece = 'X'; //Set the playerPiece as X
	}
	//Register the next player as player2/'O'
	else if (gameArray[gameArray.length - 1].player2 === null ) {
		//Set the player2 variable to the newly connected client id
		gameArray[gameArray.length - 1].player2 = socket;
		playerPiece = 'O';

		//Player 1 can now start the game and perform their first turn
		gameArray[gameArray.length - 1].player1.emit('notifyTurn', true);
		//Player 2 must wait
		socket.emit('notifyTurn', false);

		//Also make sure to reset player 1's board, in case of previous games still showing
		gameArray[gameArray.length - 1].player1.emit('reset', true);
	}
	else console.log("Error: Unable to register a new client to a game");

	var pieceMessage = 'You are playing as ' + playerPiece + 
						'\n in game ' + gameArray.length;
	//Let the client that just connected know what piece they will be playing as
	socket.emit('pieceRegistration', playerPiece, pieceMessage);

}


/*
//Find the client in the gameArray, and remove them from the game
function disconnectClient(socket) {
	
}*/

//Broadcast to all clients using socket.broadcast.emit('message', msg)

//Send a message to a specific client using res.writehead
//Use socket.emit most likely
