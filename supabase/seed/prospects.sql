-- Prospect universities: prepared before they sign, visible to the Ardoise team only.
-- Each gets its faculties, schools, departments and (where published) programmes, taken from
-- its website, MINESUP's register of authorised programmes and admissions lists. None of it
-- is confirmed: the console marks each one "unconfirmed" until its registrar checks it.
-- Run after the migrations. Safe to run twice: only what is missing is added, and a
-- university whose structure has been confirmed is left alone.

do $seed$
declare
  universities constant jsonb := $json$[
  {"slug": "ub", "name": "University of Buea", "locale": "en",
   "source": "https://kamerpower.com/university-of-buea-programs-available-for-admission https://whed.net/institutions/IAU-020049",
   "units": [
    {"name": "Faculty of Agriculture and Veterinary Medicine", "code": "FAVM", "kind": "faculty", "departments": [
      {"name": "Agricultural Economics and Agribusiness"}, {"name": "Agricultural Extension and Rural Sociology"},
      {"name": "Agronomic and Applied Molecular Sciences"}, {"name": "Animal Science"}, {"name": "Veterinary Medicine"}]},
    {"name": "Faculty of Arts", "code": "FA", "kind": "faculty", "departments": [
      {"name": "African Languages and Linguistics"}, {"name": "English"}, {"name": "French"}, {"name": "History"},
      {"name": "Linguistics"}, {"name": "Performing and Visual Arts"}]},
    {"name": "Faculty of Education", "code": "FED", "kind": "faculty", "departments": [
      {"name": "Curriculum Studies and Teaching"}, {"name": "Educational Foundations and Administration"},
      {"name": "Educational Psychology"}]},
    {"name": "Faculty of Engineering and Technology", "code": "FET", "kind": "faculty", "departments": [
      {"name": "Civil Engineering"}, {"name": "Computer Engineering"}, {"name": "Electrical and Electronic Engineering"},
      {"name": "Mechanical Engineering"}, {"name": "Telecommunications Engineering"}]},
    {"name": "Faculty of Health Sciences", "code": "FHS", "kind": "faculty", "departments": [
      {"name": "Biomedical Sciences"},
      {"name": "Medical Laboratory Sciences", "programmes": [{"name": "Bachelor of Medical Laboratory Sciences"}]},
      {"name": "Medicine", "programmes": [
        {"name": "Doctor of Medicine", "cycle": "other"}, {"name": "Doctor of Dental Surgery", "cycle": "other"},
        {"name": "Doctor of Pharmacy", "cycle": "other"}]},
      {"name": "Nursing", "programmes": [{"name": "Bachelor of Nursing Sciences"}]},
      {"name": "Public Health and Hygiene"}]},
    {"name": "Faculty of Laws and Political Science", "code": "FLPS", "kind": "faculty", "departments": [
      {"name": "Law"}, {"name": "Political Science and Public Administration"}]},
    {"name": "Faculty of Science", "code": "FS", "kind": "faculty", "departments": [
      {"name": "Biochemistry and Molecular Biology"}, {"name": "Botany and Plant Physiology"}, {"name": "Chemistry"},
      {"name": "Computer Science"}, {"name": "Environmental Science"}, {"name": "Geology"}, {"name": "Mathematics"},
      {"name": "Microbiology and Parasitology"}, {"name": "Physics"}, {"name": "Zoology and Animal Physiology"}]},
    {"name": "Faculty of Social and Management Sciences", "code": "FSMS", "kind": "faculty", "departments": [
      {"name": "Accounting"}, {"name": "Banking and Finance"}, {"name": "Economics"}, {"name": "Management"},
      {"name": "Geography"}, {"name": "Journalism and Mass Communication"}, {"name": "Sociology and Anthropology"},
      {"name": "Women and Gender Studies"}]},
    {"name": "Advanced School of Translators and Interpreters", "code": "ASTI", "kind": "school", "departments": [
      {"name": "General Studies and Promotion of Bilingualism"}, {"name": "Interpretation"}, {"name": "Translation"}]},
    {"name": "College of Technology", "code": "COT", "kind": "school", "departments": [
      {"name": "Computer Engineering"}, {"name": "Electrical and Electronic Engineering"}]},
    {"name": "Higher Technical Teacher Training College, Kumba", "code": "HTTTC", "kind": "school", "departments": [
      {"name": "Administrative Techniques"}, {"name": "Agriculture"}, {"name": "Civil Engineering and Forestry Techniques"},
      {"name": "Computer Science"}, {"name": "Electrical and Power Engineering"}, {"name": "Guidance Counselling"},
      {"name": "Law"}, {"name": "Management Sciences"}, {"name": "Mechanical Engineering"}, {"name": "Renewable Energy"},
      {"name": "Science of Education"}, {"name": "Social Economy and Family Management"},
      {"name": "Topography and Real Estate Management"}, {"name": "Tourism and Hospitality Management"}]}]},

  {"slug": "udo", "name": "Université de Douala", "locale": "fr",
   "source": "https://kamerpower.com/fr/les-differentes-facultes-de-luniversite-de-douala https://kamerpower.com/fr/faculte-des-sciences-universite-de-douala-fs/ https://kamerpower.com/fr/iut-douala-institut-universitaire-de-technologie-de-douala-filieres/3 https://whed.net/institutions/IAU-019577",
   "units": [
    {"name": "Faculté des Sciences", "code": "FS", "kind": "faculty", "departments": [
      {"name": "Biochimie"}, {"name": "Biologie des Organismes Animaux"}, {"name": "Biologie des Organismes Végétaux"},
      {"name": "Chimie"}, {"name": "Mathématiques et Informatique"}, {"name": "Physique"}, {"name": "Sciences de la Terre"}]},
    {"name": "Faculté des Lettres et Sciences Humaines", "code": "FLSH", "kind": "faculty", "departments": [
      {"name": "Anglais et Langues Étrangères", "programmes": [
        {"name": "English"}, {"name": "Études Germaniques"}, {"name": "Études Ibériques"}, {"name": "Études Bilingues"}]},
      {"name": "Anthropologie"}, {"name": "Communication"}, {"name": "Français et Études Francophones"},
      {"name": "Géographie"}, {"name": "Histoire"}, {"name": "Linguistique et Littérature Négro-Africaine"},
      {"name": "Philosophie"}, {"name": "Psychologie"}, {"name": "Sociologie"}]},
    {"name": "Faculté des Sciences Juridiques et Politiques", "code": "FSJP", "kind": "faculty", "departments": [
      {"name": "Droit Privé"}, {"name": "Droit Public"}, {"name": "Science Politique"}, {"name": "English Law"},
      {"name": "Droit Pénal et Sciences Criminelles"}]},
    {"name": "Faculté des Sciences Économiques et de Gestion Appliquée", "code": "FSEGA", "kind": "faculty", "departments": [
      {"name": "Sciences Économiques"}, {"name": "Sciences de Gestion"}]},
    {"name": "Faculté de Médecine et des Sciences Pharmaceutiques", "code": "FMSP", "kind": "faculty", "departments": [
      {"name": "Médecine", "programmes": [{"name": "Doctorat en Médecine", "cycle": "other"}]},
      {"name": "Sciences Pharmaceutiques"}, {"name": "Santé Publique"}]},
    {"name": "École Nationale Supérieure Polytechnique de Douala", "code": "ENSPD", "kind": "school", "departments": [
      {"name": "Génie Automobile et Mécatronique"}, {"name": "Génie Civil"}, {"name": "Génie des Procédés"},
      {"name": "Génie Électrique et Systèmes Intelligents"}, {"name": "Génie Énergétique"},
      {"name": "Génie Informatique et Télécommunication"}, {"name": "Génie Maritime et Portuaire"},
      {"name": "Génie Mécanique"}, {"name": "Génie Qualité, Hygiène, Sécurité et Environnement Industriel"}]},
    {"name": "École Supérieure des Sciences Économiques et Commerciales", "code": "ESSEC", "kind": "school", "departments": [
      {"name": "Études Supérieures de Commerce"}, {"name": "Études Professionnelles Approfondies"},
      {"name": "Administration des Affaires (MBA)"}, {"name": "Études Professionnelles en Organisation et Management"}]},
    {"name": "École Normale Supérieure d'Enseignement Technique", "code": "ENSET", "kind": "school", "departments": []},
    {"name": "Institut Universitaire de Technologie", "code": "IUT", "kind": "school", "departments": [
      {"name": "Génie Électrique et Informatique Industrielle"}, {"name": "Génie Industriel et Maintenance"},
      {"name": "Génie Informatique"}, {"name": "Génie Logistique et Transport"}, {"name": "Génie Mécanique et Productique"},
      {"name": "Génie Thermique et Énergie"}, {"name": "Gestion des Entreprises et des Administrations"}]},
    {"name": "Institut des Beaux-Arts de Nkongsamba", "code": "IBA", "kind": "school", "departments": []},
    {"name": "Institut des Sciences Halieutiques", "code": "ISH", "kind": "school", "departments": []}]},

  {"slug": "buib", "name": "Biaka University Institute of Buea", "locale": "en",
   "source": "https://www.devex.com/organizations/biaka-university-institute-buea-buib-115737 https://cameroon-tribune.cm/article.html/33292/fr.html/details_2",
   "units": [
    {"name": "School of Health Sciences", "kind": "school", "departments": [
      {"name": "Nursing"}, {"name": "Midwifery"}, {"name": "Health Care Management"}]},
    {"name": "School of Education", "kind": "school", "departments": []},
    {"name": "School of Management Sciences", "kind": "school", "departments": [
      {"name": "Human Resource Management"}, {"name": "Accounting and Finance"}, {"name": "Business Administration"}]}]},

  {"slug": "cuib", "name": "Catholic University Institute of Buea", "locale": "en",
   "source": "https://minesup.gov.cm/?p=8077 https://bueadiocese.org/?p=4001",
   "units": [
    {"name": "School of Business", "kind": "school", "departments": [
      {"name": "Accountancy"}, {"name": "Banking and Finance"}, {"name": "Business and Information Technology"},
      {"name": "Executive Secretarial Studies"}, {"name": "Human Resource Management"}, {"name": "Insurance"},
      {"name": "Management and Entrepreneurship"}, {"name": "Marketing"}]},
    {"name": "School of Information Technology", "kind": "school", "departments": [
      {"name": "Computer Network and Telecommunication Systems"}, {"name": "Cyber and Information Security"},
      {"name": "Information and Communication Technology"}, {"name": "Software Engineering"}]},
    {"name": "School of Engineering", "kind": "school", "departments": [
      {"name": "Chemical Engineering"}, {"name": "Civil and Environmental Engineering"},
      {"name": "Electrical and Computer Engineering"}, {"name": "Industrial and Systems Engineering"},
      {"name": "Mechanical Engineering"}, {"name": "Textile and Fiber Engineering"}]},
    {"name": "School of Agriculture and Natural Resources", "kind": "school", "departments": [
      {"name": "Agricultural Economics and Management"}, {"name": "Agricultural Engineering"},
      {"name": "Animal Husbandry Studies"}, {"name": "Food Technology"}, {"name": "Forestry Studies and Conservation"}]},
    {"name": "School of Health Sciences", "kind": "school", "departments": [
      {"name": "Nursing"}, {"name": "Midwifery"}, {"name": "Medical Laboratory Science"}]},
    {"name": "School of Journalism and Communication", "kind": "school", "departments": [
      {"name": "Communication Media and Technology"}]},
    {"name": "School of Law", "kind": "school", "departments": []}]},

  {"slug": "iuc", "name": "Institut Universitaire de la Côte", "locale": "fr",
   "source": "https://myiuc.com/?p=5772 https://www.uni2study.com/universities/cameroon/institut-universitaire-de-la-cote",
   "units": [
    {"name": "Institut Supérieur de Technologie et du Design Industriel", "code": "ISTDI", "kind": "school", "departments": [
      {"name": "Génie Mécanique"}, {"name": "Génie Biomédical"}, {"name": "Architecture et Design Industriel"}]},
    {"name": "Institut International d'Ingénierie Informatique d'Afrique Centrale", "code": "3IAC", "kind": "school", "departments": [
      {"name": "Génie Informatique"}]},
    {"name": "Institut de Commerce et d'Ingénierie d'Affaires", "code": "ICIA", "kind": "school", "departments": [
      {"name": "Logistique et Transport"}]},
    {"name": "Institut International des Sciences et Technologies de l'Innovation", "code": "IISTI", "kind": "school", "departments": []},
    {"name": "École des Sciences et Techniques Agro-Industrielles", "kind": "school", "departments": []},
    {"name": "Institut des Sciences de la Santé", "kind": "school", "departments": []},
    {"name": "École d'Ingénierie et des Sciences Appliquées", "kind": "school", "departments": []}]},

  {"slug": "iug", "name": "Institut Universitaire du Golfe de Guinée", "locale": "fr",
   "source": "https://kamerpower.com/fr/concours-cet-esg-cet-ista-2015-2016-licence-professionnelle-institut-universitaire-du-golfe-de-guinee-universite-de-dschang/ https://univ-iug.com",
   "units": [
    {"name": "École Supérieure de Gestion", "code": "ESG", "kind": "school", "departments": [
      {"name": "Finance et Comptabilité"}, {"name": "Comptabilité, Contrôle, Audit"}, {"name": "Commerce et Vente"},
      {"name": "Marketing"}, {"name": "Communication d'Entreprise"}, {"name": "Banque et Assurance"},
      {"name": "Logistique et Transport"}]},
    {"name": "Institut Supérieur des Technologies Avancées", "code": "ISTA", "kind": "school", "departments": [
      {"name": "Réseaux et Télécommunications"}, {"name": "Ingénierie Électrique"}]},
    {"name": "Institut Supérieur des Sciences Appliquées", "code": "ISA", "kind": "school", "departments": []}]},

  {"slug": "siantou", "name": "Institut Universitaire Siantou", "locale": "fr",
   "source": "https://legrandfrere.africa/etablissement/institut-universitaire-siantou/",
   "units": [
    {"name": "Institut Siantou Supérieur", "code": "ISS", "kind": "school", "departments": []},
    {"name": "Institut Supérieur de Technologie Siantou", "code": "ISTS", "kind": "school", "departments": [
      {"name": "Informatique", "programmes": [
        {"name": "Licence professionnelle en génie logiciel et bases de données informatiques"},
        {"name": "Licence professionnelle en ingénierie des systèmes informatiques et réseaux"}]},
      {"name": "Génie Civil", "programmes": [{"name": "Licence professionnelle en génie civil"}]}]},
    {"name": "Institut Supérieur de Commerce et de Gestion Siantou", "code": "ISCGS", "kind": "school", "departments": []}]},

  {"slug": "ucac", "name": "Université Catholique d'Afrique Centrale", "locale": "fr",
   "source": "https://ucac-icy.net/refonte/wp-content/uploads/2024/04/Affiche-A4-Recto-Verso-Concours-FSSG-FSJP-FPH-2024.pdf https://ucac-icy.net/refonte/wp-content/uploads/2024/10/Dossier-de-Presse-FSSG-1st-Graduation-Ceremony-2-1.pdf",
   "units": [
    {"name": "Faculté des Sciences Sociales et de Gestion", "code": "FSSG", "kind": "faculty", "departments": [
      {"name": "Sciences Sociales", "programmes": [
        {"name": "Licence en Sciences Sociales et Développement"}, {"name": "Licence en Économies Sociales et Solidaires"}]},
      {"name": "Gestion", "programmes": [
        {"name": "Licence en Comptabilité Finance"}, {"name": "Licence en Économie de Gestion"},
        {"name": "Bachelor in Management Economics"}, {"name": "Licence Gestion des Ressources Humaines"},
        {"name": "Licence en Informatique de Gestion"}, {"name": "Licence en Management, Audit et Contrôle"},
        {"name": "Licence en Marketing, Communication et Vente"},
        {"name": "Licence Qualité, Santé, Sécurité et Environnement"}]}]},
    {"name": "Faculté de Sciences Juridiques et Politiques", "code": "FSJP", "kind": "faculty", "departments": [
      {"name": "Droit Public"}, {"name": "Droit Privé"}, {"name": "Science Politique"},
      {"name": "English Law", "programmes": [{"name": "Bachelor English Law"}]}]},
    {"name": "Faculté de Philosophie", "code": "FPH", "kind": "faculty", "departments": []},
    {"name": "Faculté de Théologie", "kind": "faculty", "departments": []},
    {"name": "École des Sciences de la Santé", "code": "ESS", "kind": "school", "departments": []},
    {"name": "Institut UCAC-ICAM", "kind": "school", "departments": []}]},

  {"slug": "upac", "name": "Université Protestante d'Afrique Centrale", "locale": "fr",
   "source": "https://maligah.com/entreprises/details/Universit%C3%A9-Protestante-d'Afrique-Centrale?id=186116",
   "units": [
    {"name": "Faculté de Théologie Protestante et des Sciences Religieuses", "code": "FTPSR", "kind": "faculty", "departments": [
      {"name": "Sciences Bibliques"}, {"name": "Théologie Systématique et Éthique"}, {"name": "Théologie Pratique"},
      {"name": "Histoire et Études Religieuses"}]},
    {"name": "Faculté des Sciences Sociales et des Relations Internationales", "code": "FSSRI", "kind": "faculty", "departments": [
      {"name": "Études sur la Paix et le Développement"}, {"name": "Sciences de l'Information et Bibliothéconomie"},
      {"name": "Traduction et Interprétation"}, {"name": "Journalisme de Paix"}]},
    {"name": "Faculté des Technologies de l'Information et de la Communication", "code": "FTIC", "kind": "faculty", "departments": [
      {"name": "Génie Informatique"}, {"name": "Génie Électronique"}, {"name": "Génie des Télécommunications"}]},
    {"name": "Faculté des Sciences de la Santé", "code": "FSS", "kind": "faculty", "departments": [
      {"name": "Biologie Clinique"}, {"name": "Génie Sanitaire et Santé Publique"}, {"name": "Sciences Infirmières"}]}]},

  {"slug": "npui", "name": "National Polytechnic University Institute, Bamenda", "locale": "en",
   "source": "https://kamerpower.com/national-polytechnic-university-of-bamenda-npbedu-org-university-institute/2 https://www.adexen.com/company/206137 https://www.npbedu.org",
   "units": [
    {"name": "School of Business, Finance and Management", "kind": "school", "departments": [
      {"name": "Accountancy"}, {"name": "Banking and Finance"}, {"name": "Human Resource Management"},
      {"name": "Insurance"}, {"name": "Management Assistant (Executive Secretarial Studies)"},
      {"name": "Marketing, Trade and Sales"}, {"name": "Project Management"}]},
    {"name": "School of Engineering and Technology", "kind": "school", "departments": [
      {"name": "Air Conditioning and Refrigeration"}, {"name": "Chemical Process Technology"},
      {"name": "Civil Engineering Technology"}, {"name": "Computer Hardware Maintenance"},
      {"name": "Computer Science and Networks"}, {"name": "Computer Software Engineering"},
      {"name": "Electrical Power Systems"}, {"name": "Mechanical Manufacturing"},
      {"name": "Petroleum and Mining Engineering (Quarry Operations)"}, {"name": "Telecommunication"},
      {"name": "Urban Planning"}, {"name": "Wood Work Technology"}]},
    {"name": "School of Home Economics, Tourism and Hospitality Management", "kind": "school", "departments": [
      {"name": "Bakery and Food Processing"}, {"name": "Fashion, Clothing and Textile"},
      {"name": "Hotel and Catering Management"}, {"name": "Tourism and Travel Agency Management"}]},
    {"name": "School of Journalism and Media", "kind": "school", "departments": [{"name": "Journalism"}]},
    {"name": "School of Medical and Biomedical Sciences", "kind": "school", "departments": [
      {"name": "Nursing"}, {"name": "Midwifery"}, {"name": "Medical Laboratory Technology"}]},
    {"name": "School of Law", "kind": "school", "departments": [{"name": "Legal Assistance (Legal Practice)"}]},
    {"name": "School of Education", "kind": "school", "departments": [
      {"name": "Educational Administration and Planning"}, {"name": "Guidance and Counselling"}]},
    {"name": "School of Maritime", "kind": "school", "departments": [
      {"name": "Shipping Management"}, {"name": "Transport and Logistics Management"}]},
    {"name": "School of Agriculture and Veterinary Science", "kind": "school", "departments": [
      {"name": "Agricultural Production Technology"}, {"name": "Agropastoral Entrepreneurship"},
      {"name": "Animal Production Technology"}, {"name": "Crop Production Technology"}, {"name": "Food Technology"}]}]},

  {"slug": "catuc", "name": "Catholic University of Cameroon, Bamenda", "locale": "en",
   "source": "https://www.minesup.gov.cm/?p=7781 https://en.wikipedia.org/wiki/Catholic_University_of_Cameroon,_Bamenda",
   "units": [
    {"name": "Faculty of Arts", "kind": "faculty", "departments": [
      {"name": "Applied Anthropology"}, {"name": "English"}, {"name": "French"},
      {"name": "Geography and Environmental Studies"}, {"name": "History"}, {"name": "Philosophy"}, {"name": "Psychology"}]},
    {"name": "Faculty of Science", "kind": "faculty", "departments": [
      {"name": "Applied Mathematics"}, {"name": "Biochemistry"}, {"name": "Biology"}, {"name": "Botany"},
      {"name": "Chemistry"}, {"name": "Computer Science"}, {"name": "Environmental Science"}, {"name": "Geology"},
      {"name": "Microbiology"}, {"name": "Physics"}, {"name": "Zoology"}]},
    {"name": "School of Business", "kind": "school", "departments": [
      {"name": "Accountancy"}, {"name": "Banking and Finance"}, {"name": "Business Management"},
      {"name": "Economics"}, {"name": "Marketing"}, {"name": "Micro-Finance"}]},
    {"name": "School of Health Sciences", "kind": "school", "departments": [
      {"name": "Nursing"}, {"name": "Medical Laboratory Science"}]},
    {"name": "School of Law", "kind": "school", "departments": []}]},

  {"slug": "buist", "name": "Bamenda University Institute of Science and Technology", "locale": "en",
   "source": "https://universitycompass.com/universities/Bamenda-University-of-Science-and-Technology.php https://www.minesup.gov.cm/?p=11603",
   "units": [
    {"name": "Faculty of Agriculture", "kind": "faculty", "departments": [
      {"name": "Agricultural Economics"}, {"name": "Agricultural Engineering"}, {"name": "Animal Science"}]},
    {"name": "Faculty of Engineering", "kind": "faculty", "departments": [
      {"name": "Civil Engineering"}, {"name": "Materials Science and Engineering"}, {"name": "Mechanical Engineering"},
      {"name": "Software Engineering"}]},
    {"name": "Faculty of Health Sciences", "kind": "faculty", "departments": [
      {"name": "Medical Laboratory Science"}, {"name": "Nursing"}, {"name": "Public Health"}]},
    {"name": "Faculty of Science and Technology", "kind": "faculty", "departments": [{"name": "Computer Science"}]},
    {"name": "Faculty of Education", "kind": "faculty", "departments": [{"name": "Educational Foundations"}]},
    {"name": "Faculty of Law", "kind": "faculty", "departments": [{"name": "Law"}, {"name": "Business Law"}]},
    {"name": "Faculty of Arts", "kind": "faculty", "departments": [{"name": "Fine and Performing Arts"}]}]},

  {"slug": "iub", "name": "International University, Bamenda", "locale": "en",
   "source": "https://en.wikipedia.org/wiki/International_University,_Bamenda",
   "units": [
    {"name": "Faculty of Agriculture", "kind": "faculty", "departments": []},
    {"name": "Faculty of Arts", "kind": "faculty", "departments": []},
    {"name": "Faculty of Business Administration", "kind": "faculty", "departments": []},
    {"name": "Faculty of Education", "kind": "faculty", "departments": []},
    {"name": "Faculty of Engineering", "kind": "faculty", "departments": [
      {"name": "Agricultural Engineering"}, {"name": "Environmental Engineering"}, {"name": "Food Processing Engineering"},
      {"name": "Renewable Energy Engineering"}]},
    {"name": "Faculty of Law", "kind": "faculty", "departments": []},
    {"name": "Faculty of Management", "kind": "faculty", "departments": []},
    {"name": "Faculty of Medicine", "kind": "faculty", "departments": []},
    {"name": "Faculty of Science", "kind": "faculty", "departments": []}]},

  {"slug": "st-louis", "name": "Saint Louis Higher Institute of Health and Biomedical Sciences", "locale": "en",
   "source": "https://guardianpostonline.blogspot.com/2012/11/scholarships-from-st-louis-university_8888.html https://chronicleinfoline.blogspot.com/2012/12/9th-convocationhigher-education-public.html",
   "units": [
    {"name": "School of Medical and Biomedical Sciences", "kind": "school", "departments": [
      {"name": "Dental Therapy"}, {"name": "Health Management"}, {"name": "Medical Laboratory Sciences"},
      {"name": "Midwifery"}, {"name": "Nursing"}, {"name": "Pharmacy Technology"}, {"name": "Physiotherapy"},
      {"name": "Radiology and Ultrasonography"}]}]}
  ]$json$;
  uni jsonb;
  u jsonb;
  d jsonb;
  p jsonb;
  inst uuid;
  confirmed timestamptz;
  fid uuid;
  did uuid;
begin
  for uni in select * from jsonb_array_elements(universities) loop
    select id, structure_confirmed_at into inst, confirmed from public.institutions where slug = uni ->> 'slug';
    if inst is null then
      insert into public.institutions (name, slug, default_locale, status, structure_source, structure_confirmed_at)
      values (uni ->> 'name', uni ->> 'slug', uni ->> 'locale', 'prospect', uni ->> 'source', null)
      returning id into inst;
    elsif confirmed is not null then
      continue; -- the university has checked its structure: leave it as it is
    else
      update public.institutions set structure_source = uni ->> 'source' where id = inst;
    end if;

    for u in select * from jsonb_array_elements(uni -> 'units') loop
      fid := null;
      select id into fid from public.faculties
      where institution_id = inst and (lower(code) = lower(u ->> 'code') or lower(name) = lower(u ->> 'name'))
      limit 1;
      if fid is null then
        insert into public.faculties (institution_id, name, code, kind)
        values (inst, u ->> 'name', u ->> 'code', u ->> 'kind') returning id into fid;
      end if;
      for d in select * from jsonb_array_elements(u -> 'departments') loop
        did := null;
        select id into did from public.departments
        where institution_id = inst and faculty_id = fid and lower(name) = lower(d ->> 'name')
        limit 1;
        if did is null then
          insert into public.departments (institution_id, faculty_id, name) values (inst, fid, d ->> 'name') returning id into did;
        end if;
        for p in select * from jsonb_array_elements(coalesce(d -> 'programmes', '[]'::jsonb)) loop
          if not exists (select 1 from public.programmes where department_id = did and lower(name) = lower(p ->> 'name')) then
            insert into public.programmes (institution_id, department_id, name, code, cycle)
            values (inst, did, p ->> 'name', p ->> 'code', coalesce(p ->> 'cycle', 'licence'));
          end if;
        end loop;
      end loop;
    end loop;
  end loop;
end
$seed$;
