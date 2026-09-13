-- P26 : meme correction que P24b, cote passager cette fois.
--
-- Le passager de test cree lors de la validation initiale du Sénégal
-- (P23/P24) portait le numero au format E.164 (+221781234567) -- alors
-- que, comme les chauffeurs, tous les numeros passagers reels sont
-- stockes/saisis en format local sans indicatif. Corrige par coherence,
-- avant que le client ne teste lui-meme l'app passager avec un numero
-- local et ne retrouve pas cette course de test dans son historique.
update public.passagers set telephone = '781234567'
where telephone = '+221781234567';
