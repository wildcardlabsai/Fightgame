/**
 * NAME POOLS (new careers only). Fighter names are drawn from heritage groups inside each nation: a nationality is where a fighter
 * boxes from, not a single ethnicity, so most nations list more than one group. First and last name normally come from the same
 * group, with a small chance of a cross-group surname (marriage, adoption, mixed families). Names are fictional combinations of
 * common given names and surnames; nothing here is tied to a skin tone or a portrait.
 *
 * Within a group the list is ordered roughly most common first and selection tapers gently (see `pickRanked`), so ordinary names
 * recur a little more than rare ones but no short head dominates. Legacy saves keep the small pools in `nations.ts`.
 */
import { nation } from './nations'

export interface NameGroup { w: number; first: string[]; last: string[] }
const s = (t: string): string[] => t.split(',').map((x) => x.trim()).filter(Boolean)
const g = (w: number, first: string, last: string): NameGroup => ({ w, first: s(first), last: s(last) })

const BRITISH_FIRST = 'Jack, Liam, Callum, Connor, Reece, Tyler, Declan, Josh, Harvey, Danny, Kieran, Ellis, Ryan, Bradley, Jordan, Oliver, Harry, George, Charlie, Lewis, Joe, Archie, Alfie, Mason, Luke, Aaron, Adam, Dean, Craig, Scott, Gary, Mark, Paul, Ben, Sam, Nathan, Daniel, Kyle, Brandon, Cameron, Jake, Owen, Finley, Rory, Nicky, Tommy, Wesley, Dale, Carl, Ricky, Troy, Leon, Curtis, Elliot, Kai, Jay, Kane, Stuart, Barry, Lee'
const BRITISH_LAST = 'Hartley, Brennan, Whitlock, Rowe, Pritchard, Ashworth, Mercer, Kendrick, Dobson, Fenwick, Calloway, Thorne, Redfern, Stokes, Barrett, Walker, Hughes, Turner, Marshall, Fletcher, Holland, Bailey, Cooper, Gibbons, Harper, Lowe, Mills, Newton, Parkin, Quinn, Riley, Sharpe, Tanner, Upton, Vickers, Wilcox, Yates, Atkins, Bowen, Carver, Dyson, Eastwood, Farrow, Gower, Hobbs, Ingram, Jessop, Kirby, Lawson, Moss, Naylor, Oakley, Platt, Rimmer, Sutcliffe, Tipping, Unwin, Voss, Wadsworth, Ainsley, Booth, Crowther, Denton, Entwistle, Foster, Garside, Haigh, Isherwood, Jagger, Kershaw, Lumb, Maguire, Nuttall, Ormerod, Pickles, Rawlinson, Scholes, Threlfall, Whittaker, Armitage, Bagshaw, Clegg, Dewhurst, Ellison, Fairclough'

export const NAME_GROUPS: Record<string, NameGroup[]> = {
  ENG: [
    g(78, BRITISH_FIRST, BRITISH_LAST),
    g(8, 'Marcus, Jermaine, Dwayne, Tyrone, Delroy, Kemar, Jamal, Corey, Leon, Ashley, Devon, Rio, Nathaniel, Omari, Shaun, Tristan, Kwame, Andre, Lloyd, Winston', 'Okafor, Campbell, Brown, Clarke, Gordon, Henry, Mensah, Francis, Grant, Barnes, Bailey, Ellis, Williams, Reid, Dixon, Powell, Morgan, Simms, Adeyemi, Osei, Thompson, Richards, Lewis, Nelson, Edwards, Palmer, Charles, Wright, Walters, Samuels'),
    g(5, 'Imran, Asif, Hamza, Zain, Amir, Rohan, Tariq, Arjun, Nabil, Yusuf, Faisal, Haroon, Kabir, Sunny, Jas', 'Khan, Ahmed, Hussain, Malik, Sharma, Patel, Singh, Chaudhry, Iqbal, Rahman, Siddiqui, Bashir, Gill, Dhillon, Mirza, Qureshi, Anwar, Bhatti, Saleem, Ali'),
    g(4, 'Seamus, Declan, Cormac, Padraig, Eamonn, Brendan, Kieran, Niall, Fergus, Dermot', 'Doyle, Murphy, Kelly, Byrne, Reilly, Nolan, Gallagher, Coyle, McGuire, Flynn, Brady, Sheehan, Costello, Daly, Heaney'),
    g(3, 'Tomasz, Marek, Piotr, Andrzej, Jakub, Dariusz, Marcin, Kacper, Lukasz, Mateusz', 'Kowalski, Nowak, Wisniewski, Dabrowski, Lewandowski, Szymanski, Wozniak, Kaminski, Jankowski, Mazur, Kubiak, Pawlak'),
    g(2, 'Marco, Luca, Dario, Enzo, Fabio, Gino, Nico, Paolo', 'Rossi, Moretti, Conti, Bianchi, Ferrari, Esposito, Romano, Greco, Marino, Rinaldi'),
  ],
  SCO: [
    g(92, 'Craig, Calum, Euan, Ross, Fraser, Lewis, Gavin, Stuart, Ewan, Callum, Kenny, Alasdair, Murray, Struan, Hamish, Iain, Lachlan, Rory, Cameron, Scott, Jamie, Kyle, Darren, Gordon, Neil, Allan, Graeme, Ruaridh, Finlay, Angus, Douglas, Dougie, Greig, Blair, Innes', 'McAllister, Dunbar, Gillespie, Rennie, Cathcart, Lennox, Baird, Kinnear, MacLeod, Campbell, Stewart, Robertson, Henderson, Buchanan, Morrison, Crawford, Cameron, Sinclair, Guthrie, Hepburn, Rutherford, Ferguson, Galbraith, Imrie, Kerr, Laird, Menzies, Nairn, Ogilvie, Paterson, Rankin, Shearer, Tennant, Urquhart, Wallace, Yule, Drummond, Fyfe, Gunn, Haddow, Lindsay, Mackie, Napier, Pettigrew'),
    g(8, 'Imran, Zain, Haroon, Ali, Kabir, Raj', 'Khan, Ahmed, Hussain, Malik, Sarwar, Iqbal, Chaudhry, Rashid'),
  ],
  WAL: [
    g(95, 'Rhys, Owain, Gethin, Dewi, Steffan, Iolo, Cai, Tomos, Gareth, Dafydd, Aled, Ieuan, Emyr, Huw, Llyr, Osian, Ryan, Jamie, Callum, Ben, Alun, Bryn, Carwyn, Elis, Griff, Morgan, Siôn, Trystan, Gwilym, Wyn, Idris', 'Pryce, Llewellyn, Bevan, Rees, Gwynne, Prosser, Vaughan, Thomas, Davies, Evans, Morgan, Powell, Lloyd, Hopkins, Griffiths, Howells, Pugh, Probert, Meredith, Bowen, Price, Jenkins, Parry, Rhys, Cadogan, Dyer, Gethin, Harries, Isaac, Jones, Maddocks, Nash, Owen, Phelps, Tudor, Wynne, Beynon, Cule, Edmunds'),
    g(5, 'Ahmed, Zain, Jamal, Dwayne', 'Ali, Hassan, Khan, Williams'),
  ],
  IRL: [
    g(100, 'Cian, Ronan, Eoin, Darragh, Tadhg, Fintan, Oisin, Colm, Conor, Sean, Padraig, Cathal, Diarmuid, Donal, Eamon, Liam, Niall, Ciaran, Kevin, Shane, Brian, Declan, Jack, Cormac, Fergal, Lorcan, Rian, Senan, Aidan, Dara, Eanna, Killian, Michael, Rory, Barry, Gerard, Noel, Paudie, Ruairi, Tiernan', 'Donnelly, Keogh, Madden, Gallagher, Fitzpatrick, Brogan, Cullen, Rafferty, Murphy, Kelly, Walsh, Byrne, Ryan, O\'Brien, Doyle, Quinn, Lynch, Carroll, Hennessy, Mullan, Nugent, Corcoran, Dempsey, Hogan, Keane, Lavelle, Moran, Nestor, Phelan, Rooney, Tierney, Vaughan, Kearney, Boyle, Delaney, Egan, Farrell, Geraghty, Hayes, Kenny'),
  ],
  USA: [
    g(40, 'Terrell, Marcus, Devin, Isaiah, Dante, Tyrese, Malik, Jalen, Darius, Elijah, Andre, Kendrick, Demetrius, Lamar, Rashad, Cedric, Jerome, DeShawn, Tavon, Xavier, Brandon, Justin, Corey, Terrance, Maurice, Antonio, Jamal, Reggie, Calvin, Keyon, Desmond, Trevon, Isaac, Quincy, Vernon, Ronald, Curtis, Darnell, Gerald, Lonnie', 'Jackson, Whitfield, Maddox, Banks, Coleman, Monroe, Tucker, Lamar, Washington, Jefferson, Freeman, Baptiste, Cannon, Dorsey, Ellison, Fairley, Grier, Hollins, Ivory, Jernigan, Kimble, Lattimore, Mosley, Nash, Odom, Pettway, Rucker, Spivey, Tolbert, Underwood, Vance, Waddell, Yarbrough, Alston, Bynum, Crenshaw, Dukes, Epps, Fuller, Gaines, Hairston, Irvin, Joyner'),
    g(32, 'Caleb, Wyatt, Cole, Austin, Shawn, Tanner, Dalton, Hunter, Garrett, Colton, Ryan, Tyler, Logan, Chase, Cody, Trent, Brett, Jesse, Travis, Kyle, Dustin, Mason, Clay, Dillon, Landon, Nolan, Reid, Seth, Wade, Zack, Brock, Ethan, Grant, Heath', 'Sutton, Prescott, Hawkins, Dalton, Rutledge, Slater, Fontaine, Briggs, Callahan, Mitchell, Parker, Bennett, Hayes, Dawson, Holloway, Kessler, Langley, McCoy, Nolan, Osborne, Pruitt, Quigley, Ramsey, Stafford, Teague, Vickers, Whitaker, Yates, Zimmer, Brewer, Colburn, Dunham, Easley, Fischer, Garrison, Harlan, Jarrett, Kincaid, Lockett'),
    g(18, 'Alejandro, Mateo, Santiago, Adrian, Diego, Ruben, Angel, Cesar, Jorge, Luis, Omar, Rafael, Victor, Julian, Eduardo, Gilberto, Mauricio, Esteban, Hector, Joaquin, Emilio, Oscar, Francisco, Ismael, Rene', 'Garcia, Rodriguez, Martinez, Hernandez, Lopez, Gonzalez, Ramirez, Torres, Flores, Rivera, Morales, Ortiz, Gutierrez, Ruiz, Mendoza, Reyes, Castillo, Vargas, Jimenez, Salazar, Aguilar, Medina, Navarro, Orozco, Pena, Quezada, Rojas, Solis, Trevino, Valdez, Zuniga, Arellano, Bustamante, Cardenas'),
    g(6, 'Michael, Anthony, Vincent, Frankie, Nicky, Sal, Dominic, Joey, Carmine, Rocco', 'Russo, DeLuca, Marino, Benedetto, Caruso, Esposito, Bruno, Costa, Palmieri, Ricci, Salerno, Giordano'),
    g(4, 'Kevin, Patrick, Sean, Brendan, Casey, Kieran, Danny, Mickey', 'Sullivan, Flanagan, McBride, Donovan, Whelan, Gilroy, Keefe, Tierney, Quigg, Lacey'),
    g(3, 'Dmitri, Pavel, Viktor, Aleksandr, Stan, Gene, Leo, Nikolai', 'Kowalczyk, Petrov, Novak, Sokolov, Lazarev, Wozniak, Zielinski, Orlov, Baranski, Makarov'),
    g(2, 'Kai, Jin, Kevin, Brian, Darren, Eric, Kenji', 'Nguyen, Tran, Pham, Chen, Nakamura, Kim, Park, Tanaka, Lim, Le'),
  ],
  MEX: [
    g(100, 'Alejandro, Emiliano, Rodrigo, Santiago, Mateo, Joaquín, Diego, Ricardo, Miguel, Jesús, Luis, Carlos, Fernando, Javier, Raúl, Gerardo, Ernesto, Héctor, Iván, Jorge, Abraham, Eduardo, Armando, Octavio, Saúl, Gilberto, Óscar, Rubén, Cristian, Bernardo, Dagoberto, Efraín, Fidel, Gael, Isaac, Leonardo, Marco, Noé, Omar, Pablo, Rogelio, Salvador', 'Villanueva, Estrada, Ochoa, Barrientos, Cisneros, Montoya, Zamora, Quintero, Hernández, García, Martínez, López, González, Rodríguez, Pérez, Sánchez, Ramírez, Flores, Gómez, Díaz, Cruz, Reyes, Morales, Jiménez, Vázquez, Castillo, Mendoza, Ruiz, Aguirre, Carrillo, Delgado, Escobedo, Fuentes, Guerrero, Ibarra, Lozano, Macías, Naranjo, Ortega, Palacios, Rangel, Salinas, Trujillo, Uribe, Valenzuela, Zavala'),
  ],
  PUR: [
    g(100, 'Xavier, Adrián, Hector, Luis, Orlando, Jesús, Ángel, Edwin, Carlos, José, Juan, Wilfredo, Félix, Miguel, Gabriel, Samuel, Christian, Jonathan, Kevin, Anthony, Alexis, Efraín, Iván, Josué, Nelson, Omar, Rafael, Ricky, Tito, Wilson', 'Colón, Santiago, Rosario, Cintrón, Maldonado, Figueroa, Quiles, Torres, Rivera, Ortiz, Rodríguez, Vázquez, Cruz, Pérez, Díaz, Ramos, Morales, Medina, Sepúlveda, Acevedo, Báez, Candelaria, Dávila, Echevarría, Feliciano, Galarza, Heredia, Irizarry, Laboy, Marrero, Nieves, Ocasio, Pagán, Rentas, Soto, Tirado, Vega, Zayas'),
  ],
  CUB: [
    g(100, 'Yuniel, Osvaldo, Lázaro, Roniel, Erislandy, Yordenis, Luis, Dariel, Yoandry, Eliecer, Hanier, Yosvany, Orlando, Reinier, Ismael, Rolando, Julio, Yadier, Duniel, Alexei, Dayron, Frank, Gilberto, Idel, Javier, Leonel, Maikel, Noel, Ramón, Yasniel', 'Pedroso, Savón, Lamela, Iglesias, Despaigne, Arguelles, Hurtado, Lara, Rodríguez, Fernández, González, Pérez, Hernández, Díaz, Álvarez, Castillo, Cárdenas, Duarte, Espinosa, Fonseca, Gamboa, Herrera, Izquierdo, Jiménez, Leyva, Mesa, Napoles, Oliva, Portuondo, Quesada, Ravelo, Sarduy, Tamayo, Ulloa, Valdés, Zaldívar'),
  ],
  DOM: [
    g(100, 'Julio, Pedro, Rafael, Wilfredo, Starling, Miguel, Leonel, Franklin, Juan, José, Luis, Manuel, Félix, Ramón, Domingo, Alexis, Carlos, Danilo, Edwin, Fausto, Giovanni, Hamlet, Ismael, Jairo, Kelvin, Moisés, Nelson, Pablo, Rudy, Yunior', 'Peralta, Batista, Cabrera, Mejía, Reyes, Taveras, Guzmán, Núñez, Rodríguez, Martínez, Pérez, García, Sánchez, Santana, De la Cruz, Jiménez, Polanco, Rosario, Ventura, Almonte, Brito, Capellán, Disla, Encarnación, Familia, Germán, Hidalgo, Jáquez, Luciano, Minaya, Ogando, Paulino, Rijo, Sención, Tejada, Urbáez, Vargas'),
  ],
  UKR: [
    g(100, 'Oleksandr, Taras, Bohdan, Mykola, Denys, Artem, Yaroslav, Vitaliy, Andriy, Dmytro, Serhiy, Ihor, Maksym, Roman, Vasyl, Volodymyr, Yuriy, Oleh, Pavlo, Ruslan, Stepan, Anatoliy, Danylo, Eduard, Hryhoriy, Illia, Kostyantyn, Leonid, Mykhailo, Nazar, Petro, Rostyslav, Svyatoslav, Timur', 'Kovalenko, Hrytsenko, Marchuk, Savchenko, Tkachenko, Bondar, Melnyk, Shevchuk, Boyko, Kovalchuk, Kravchenko, Oliynyk, Shevchenko, Polishchuk, Lysenko, Moroz, Rudenko, Tkachuk, Petrenko, Honchar, Panchenko, Karpenko, Zinchenko, Bilyk, Danylenko, Fedorenko, Hnatiuk, Ivanchenko, Klymenko, Lytvyn, Mazur, Nikolaiev, Onyshchenko, Pavlenko, Romanenko, Sydorenko, Tereshchenko, Yakymenko'),
  ],
  POL: [
    g(100, 'Kamil, Mateusz, Paweł, Łukasz, Tomasz, Bartosz, Michał, Damian, Jakub, Piotr, Marcin, Krzysztof, Adrian, Dawid, Grzegorz, Marek, Rafał, Sebastian, Szymon, Wojciech, Artur, Błażej, Cezary, Dominik, Filip, Hubert, Igor, Karol, Mariusz, Norbert, Patryk, Radosław, Sławomir, Tadeusz, Wiktor, Zbigniew', 'Nowak, Wójcik, Kaczmarek, Zieliński, Adamczyk, Dudek, Sikora, Pawlak, Kowalski, Wiśniewski, Dąbrowski, Lewandowski, Kamiński, Szymański, Woźniak, Kozłowski, Jankowski, Mazur, Krawczyk, Piotrowski, Grabowski, Nowakowski, Pawłowski, Michalski, Zając, Król, Wieczorek, Jabłoński, Majewski, Olszewski, Stępień, Malinowski, Jaworski, Górski, Rutkowski, Sobczak, Baran, Duda, Czarnecki'),
  ],
  GER: [
    g(80, 'Jonas, Felix, Lukas, Maximilian, Tim, Dennis, Stefan, Jens, Florian, Sebastian, Tobias, Marcel, Kevin, Jan, Niklas, Patrick, Philipp, Moritz, Leon, Bastian, Christoph, Daniel, Erik, Fabian, Gregor, Henrik, Johannes, Kai, Lars, Matthias, Nils, Oliver, Rene, Sven, Thorsten, Uwe', 'Brandt, Köhler, Reinhardt, Vogel, Hartmann, Lindner, Krüger, Albrecht, Müller, Schmidt, Schneider, Fischer, Weber, Meyer, Wagner, Becker, Schulz, Hoffmann, Koch, Richter, Klein, Wolf, Schröder, Neumann, Schwarz, Zimmermann, Braun, Hofmann, Hartwig, Jäger, Keller, Lange, Maurer, Nagel, Ott, Pfeiffer, Roth, Sommer, Thiel, Ullrich, Winkler'),
    g(14, 'Emre, Murat, Can, Burak, Kerem, Deniz, Cem, Yusuf, Hakan, Serkan', 'Yilmaz, Kaya, Demir, Çelik, Şahin, Yıldız, Aydın, Özdemir, Arslan, Doğan, Kılıç, Aslan, Çetin, Kara, Koç'),
    g(6, 'Alexander, Waldemar, Eugen, Viktor, Artur, Andreas, Rudolf', 'Schneider, Wagner, Friesen, Klassen, Penner, Reimer, Dyck, Neufeld, Wiebe'),
  ],
  NGA: [
    g(100, 'Chidi, Emeka, Tunde, Segun, Obinna, Femi, Kelechi, Ibrahim, Chukwuemeka, Ikenna, Olumide, Babatunde, Chinedu, Damilola, Efe, Folarin, Gbenga, Hassan, Ifeanyi, Jide, Kunle, Lanre, Musa, Nnamdi, Ogbonna, Peter, Rotimi, Sani, Taiwo, Uche, Victor, Wale, Yinka, Zubair', 'Adeyemi, Okonkwo, Balogun, Eze, Ogunleye, Nwosu, Adebayo, Ibe, Okafor, Adeleke, Chukwu, Danjuma, Ejiofor, Fashola, Giwa, Ibrahim, Jegede, Kalu, Lawal, Mohammed, Nnadi, Obi, Onyeama, Salami, Tijani, Udoh, Yusuf, Abubakar, Bello, Dosunmu, Egwu, Femi-Johnson, Igwe, Johnson, Komolafe, Oyelaran'),
  ],
  GHA: [
    g(100, 'Kwame, Kofi, Yaw, Nii, Emmanuel, Isaac, Joseph, Kwesi, Kojo, Kwabena, Nana, Samuel, Daniel, Michael, Prince, Richard, Francis, Abdul, Ebenezer, Fiifi, Gideon, Ishmael, Jerry, Kweku, Larry, Maxwell, Nathaniel, Osei, Raphael, Seth, Theophilus', 'Mensah, Quaye, Addo, Tetteh, Boateng, Ofori, Annan, Lamptey, Owusu, Asante, Appiah, Acheampong, Amoah, Armah, Badu, Darko, Essien, Frimpong, Gyamfi, Hammond, Inkoom, Kuffour, Larbi, Mintah, Nkrumah, Opoku, Quartey, Sarpong, Tagoe, Yeboah, Aryee, Bortey, Commey, Dodoo, Okine'),
  ],
  AUS: [
    g(88, 'Jarrod, Blake, Kyle, Mitchell, Lachlan, Brodie, Nathan, Zane, Jack, Liam, Riley, Cooper, Hayden, Tyson, Jai, Corey, Dylan, Brayden, Declan, Flynn, Harrison, Jordan, Kane, Luke, Mason, Nick, Owen, Rhys, Shane, Tom, Wade, Beau, Callum, Dane', 'Hennessy, Carmody, Treloar, Beckett, Macrae, Duffy, Sinclair, Gleeson, Mitchell, Kelly, Thompson, Murray, Webb, Hogan, Pearce, Rowe, Sampson, Tait, Vella, Whelan, Ashby, Brooks, Cleary, Doyle, Elliott, Forbes, Gill, Hoskins, Irvine, Jarvis, Keogh, Lacey, McKenna, Noonan, O\'Shea, Pascoe, Quinlan, Rutter'),
    g(7, 'Tevita, Sione, Mosese, Manu, Joseph, Tau, Isaac, Jerome', 'Faleolo, Tupou, Mahe, Taufa, Leota, Fa\'alogo, Pomare, Tuilagi, Salesa, Toala, Matagi, Fifita'),
    g(5, 'Duc, Minh, Anh, Khoa, Tuan, Hung', 'Nguyen, Tran, Le, Pham, Vo, Ly, Dang, Hoang'),
  ],
  JPN: [
    g(100, 'Kenta, Ryota, Haruto, Daisuke, Takumi, Shun, Kazuki, Naoya, Yuto, Sota, Kaito, Ren, Hiroki, Takashi, Masato, Taiga, Ryo, Yusuke, Koki, Daiki, Tomoya, Shinji, Akira, Eiji, Genki, Hayato, Issei, Junpei, Keita, Makoto, Noboru, Osamu, Satoshi, Toru, Yamato', 'Tanabe, Fujimoto, Okada, Hayashi, Matsuda, Ishikawa, Nakagawa, Kuroda, Sato, Suzuki, Takahashi, Tanaka, Watanabe, Ito, Yamamoto, Nakamura, Kobayashi, Kato, Yoshida, Yamada, Sasaki, Yamaguchi, Saito, Matsumoto, Inoue, Kimura, Shimizu, Ogawa, Aoki, Fukuda, Goto, Harada, Imai, Kondo, Maeda, Noguchi, Ozawa, Sakamoto, Takeda, Ueda'),
  ],
  PHI: [
    g(100, 'Jerwin, Rey, Marlon, Jonas, Nonito, Carlo, Dennis, Mark, John, Jericho, Rolly, Arnel, Jayson, Ronnie, Glenn, Ramil, Albert, Bryan, Christian, Edgar, Froilan, Gerry, Harold, Jomar, Kenneth, Leo, Melvin, Noel, Oliver, Rodel, Sherwin, Vincent', 'Dela Cruz, Bautista, Magsayo, Pacheco, Abelardo, Sison, Villar, Aquino, Santos, Reyes, Garcia, Mendoza, Ramos, Cruz, Flores, Gonzales, Lopez, Castillo, Dizon, Evangelista, Francisco, Galang, Hernandez, Ignacio, Javier, Lacson, Manalo, Navarro, Ocampo, Pascual, Quiambao, Rivera, Salazar, Tolentino, Valdez, Zamora'),
  ],
  ARG: [
    g(90, 'Matías, Facundo, Nicolás, Sergio, Brian, Leandro, Ezequiel, Julián, Lucas, Gonzalo, Martín, Federico, Maximiliano, Franco, Agustín, Ramiro, Santiago, Damián, Emiliano, Cristian, Rodrigo, Hernán, Ignacio, Joaquín, Lautaro, Marcos, Pablo, Tomás, Walter, Fabián', 'Benítez, Maidana, Acosta, Sosa, Ledesma, Fernández, Ibarra, Giménez, González, Rodríguez, Gómez, Pérez, Díaz, Sánchez, Romero, Álvarez, Torres, Ruiz, Ramírez, Flores, Medina, Castro, Vega, Herrera, Molina, Suárez, Aguirre, Bustos, Cabrera, Domínguez, Escobar, Figueroa, Godoy, Luna'),
    g(10, 'Franco, Matteo, Nicola, Lorenzo, Dante, Gino', 'Bianchi, Ricci, Pellegrini, Moretti, Rizzo, Ferrari, Barbieri, Colombo, Serafini, Marconi'),
  ],
  KAZ: [
    g(100, 'Daulet, Yerlan, Aslan, Nurlan, Timur, Bakhyt, Arman, Serik, Aibek, Asylbek, Baurzhan, Dias, Eldar, Ghani, Kairat, Marat, Nurzhan, Olzhas, Ruslan, Sanzhar, Talgat, Yerbol, Zhanibek, Almas, Berik, Dastan, Erzhan, Galym, Kanat, Madi', 'Abdrakhmanov, Nurgaliyev, Seitov, Kassymov, Zhunusov, Omarov, Baimukhanov, Tolegen, Akhmetov, Beisenov, Dzhaksybekov, Ermekov, Iskakov, Kenzhebayev, Mukhametov, Nurmagambetov, Ospanov, Rakhimov, Sagyndykov, Tursynov, Utegenov, Zhakupov, Amirov, Bekmukhambetov, Dosmukhambetov, Kuanyshev, Sarsenov'),
  ],
}

/** Famous full names that are skipped when drawn (a fictional world should not contain real champions by accident). */
const BLOCKED = new Set([
  'mike tyson', 'tyson fury', 'floyd mayweather', 'manny pacquiao', 'canelo alvarez', 'oleksandr usyk', 'anthony joshua', 'deontay wilder', 'muhammad ali', 'joe frazier',
  'george foreman', 'sugar ray leonard', 'oscar de la hoya', 'evander holyfield', 'lennox lewis', 'naoya inoue', 'terence crawford', 'gennady golovkin', 'vasyl lomachenko',
  'julio cesar chavez', 'roy jones', 'bernard hopkins', 'ricky hatton', 'joe calzaghe', 'carl froch', 'chris eubank', 'nigel benn', 'amir khan', 'david haye', 'dillian whyte',
  'devin haney', 'ryan garcia', 'gervonta davis', 'errol spence', 'jermell charlo', 'jermall charlo', 'shakur stevenson', 'vito antuofermo', 'jake lamotta', 'rocky marciano',
  'sonny liston', 'larry holmes', 'marvin hagler', 'thomas hearns', 'roberto duran', 'felix trinidad', 'miguel cotto', 'erik morales', 'marco antonio barrera', 'juan manuel marquez',
])
export const isBlockedName = (first: string, last: string): boolean => BLOCKED.has(`${first} ${last}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))

// ------------------------------------------------------------------------------------------------ selection
const phi = 0.6180339887498949
const frac = (x: number): number => x - Math.floor(x)

/** Index into an ordered list: a gentle linear taper (head ~3x as likely as tail). `u` in [0,1). */
export function pickRanked(n: number, u: number): number {
  const x = (1 - Math.sqrt(Math.max(0, 1 - 0.91 * u))) / 0.7
  return Math.min(n - 1, Math.floor(x * n))
}

/** Deterministic 0..1 mix of two uniforms and an attempt number (no RNG stream is touched). */
function mix(a: number, b: number, k: number): number {
  let h = Math.imul(Math.floor(a * 4294967296) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.floor(b * 4294967296) + k * 0x27d4eb2f, 0xc2b2ae35)
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

const poolCache = new Map<string, NameGroup[]>()
function groupsOf(nationKey: string): NameGroup[] {
  let gs = poolCache.get(nationKey)
  if (!gs) {
    gs = NAME_GROUPS[nationKey] ?? (() => { const n = nation(nationKey); return n ? [{ w: 1, first: n.firstNames, last: n.lastNames }] : [] })()
    poolCache.set(nationKey, gs)
  }
  return gs
}

function pickGroup(gs: NameGroup[], u: number): { group: NameGroup; r: number; i: number } {
  let total = 0
  for (const x of gs) total += x.w
  let t = u * total, lo = 0
  for (let i = 0; i < gs.length; i++) {
    if (t < gs[i].w || i === gs.length - 1) return { group: gs[i], r: Math.min(0.999999, t / gs[i].w), i }
    t -= gs[i].w; lo += gs[i].w
  }
  void lo
  return { group: gs[0], r: 0, i: 0 }
}

/**
 * Draws a name from two uniforms the caller already consumed (so the simulation stream is identical to the legacy generator).
 * `taken` holds full names already in the world: a collision re-draws the surname (then the given name) from a hash of the same
 * two uniforms, which is deterministic and consumes no further randomness. Shared surnames across different given names are allowed.
 */
export function drawName(nationKey: string, u1: number, u2: number, taken?: ReadonlySet<string>): { firstName: string; lastName: string } {
  const gs = groupsOf(nationKey)
  const { group, r } = pickGroup(gs, u1)
  let first = group.first[pickRanked(group.first.length, r)]
  const crossish = gs.length > 1 && mix(u1, u2, 97) < 0.07
  const lastGroup = crossish ? gs[Math.min(gs.length - 1, Math.floor(mix(u1, u2, 98) * gs.length))] : group
  let last = lastGroup.last[pickRanked(lastGroup.last.length, u2)]
  for (let k = 1; k <= 24; k++) {
    const key = `${first} ${last}`
    if (!isBlockedName(first, last) && !taken?.has(key)) break
    const a = mix(u1, u2, k), b = mix(u2, u1, k + 31)
    last = lastGroup.last[pickRanked(lastGroup.last.length, frac(u2 + phi * k + a * 0.3))]
    if (k % 3 === 0) first = group.first[pickRanked(group.first.length, b)]
  }
  return { firstName: first, lastName: last }
}

export const nameKey = (first: string, last: string): string => `${first} ${last}`
